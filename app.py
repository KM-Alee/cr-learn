from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import traceback
import os
import config
from functools import wraps
import json
from datetime import datetime, timedelta, date

app = Flask(__name__)

app.config['MYSQL_HOST'] = config.DB_HOST
app.config['MYSQL_USER'] = config.DB_USER
app.config['MYSQL_PASSWORD'] = config.DB_PASSWORD
app.config['MYSQL_DB'] = config.DB_NAME
app.config['MYSQL_PORT'] = config.DB_PORT
app.config['MYSQL_CURSORCLASS'] = 'DictCursor'

app.secret_key = config.SECRET_KEY

mysql = MySQL(app)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            # Check if the request likely expects JSON
            if request.accept_mimetypes.accept_json and \
               not request.accept_mimetypes.accept_html or \
               request.path.startswith('/api/'): # Also check if it's an API path
                return jsonify(success=False, errors={'general': 'Authentication required'}), 401
            else:
                flash('Please log in to access this page.', 'warning')
                return redirect(url_for('auth', tab='login'))
        return f(*args, **kwargs)
    return decorated_function



@app.route('/')
def index():
    return render_template('index.html')

@app.route('/reviews')
def reviews():
    return render_template('reviews.html')

@app.route('/auth', methods=['GET', 'POST'])
def auth():
    tab = request.args.get('tab', 'login')
    return render_template('auth.html', tab=tab)

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/tags', methods=['GET'])
@login_required
def api_get_tags():
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # Fetches all unique tag names associated with the current user's notes OR decks
        cur.execute("""
            SELECT DISTINCT t.id, t.name 
            FROM tags t
            INNER JOIN note_tags nt ON t.id = nt.tag_id
            INNER JOIN notes n ON nt.note_id = n.id
            WHERE n.user_id = %s
            UNION
            SELECT DISTINCT t.id, t.name
            FROM tags t
            INNER JOIN deck_tags dt ON t.id = dt.tag_id
            INNER JOIN decks d ON dt.deck_id = d.id
            WHERE d.user_id = %s
            ORDER BY name ASC
        """, (user_id, user_id))
        tags = cur.fetchall()
        if not tags: # If no tags are found for the user from notes or decks
            # Optionally, fetch all global tags if you want a general list
            # cur.execute("SELECT id, name FROM tags ORDER BY name ASC")
            # tags = cur.fetchall()
            # For now, just return empty if user has no tagged items
            pass
        return jsonify(success=True, tags=tags)
    except Exception as e:
        print(f"Error fetching tags for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/api/cards/search', methods=['GET'])
@login_required
def api_search_cards():
    user_id = session['user_id']
    search_query_term = request.args.get('query', '').strip()
    tag_ids_str = request.args.get('tags', '') 
    # === NEW: Optional deck_id filter ===
    deck_id_str = request.args.get('deck_id', '').strip() 

    cur = mysql.connection.cursor()
    try:
        sql_query_base = """
            SELECT 
                n.id as note_id, 
                f.id as flashcard_id,
                n.field_values, 
                d.name as deck_name,
                d.id as deck_id,
                f.card_type,
                f.due_date,
                (SELECT GROUP_CONCAT(DISTINCT t_sub.name SEPARATOR ', ') 
                 FROM tags t_sub
                 JOIN note_tags nt_sub ON t_sub.id = nt_sub.tag_id
                 WHERE nt_sub.note_id = n.id) as note_tags 
            FROM notes n
            JOIN flashcards f ON n.id = f.note_id  
            JOIN decks d ON f.deck_id = d.id
            WHERE n.user_id = %s 
        """
        params = [user_id]
        conditions = [] 

        # Add search term condition
        if search_query_term:
            conditions.append("(n.field_values LIKE %s)")
            params.append(f"%{search_query_term}%")

        # Add tag filtering condition (matching ANY of the selected tags)
        tag_ids = []
        if tag_ids_str:
            try:
                tag_ids = [int(tid) for tid in tag_ids_str.split(',') if tid.strip()]
            except ValueError:
                return jsonify(success=False, errors={'tags': 'Invalid tag ID format.'}), 400
            
            if tag_ids:
                placeholders = ','.join(['%s'] * len(tag_ids))
                conditions.append(f"n.id IN (SELECT nt_sub.note_id FROM note_tags nt_sub WHERE nt_sub.tag_id IN ({placeholders}))")
                params.extend(tag_ids)

        # === NEW: Add deck filtering condition ===
        deck_ids = [] # Allow multiple decks if frontend supports multi-select
        if deck_id_str:
             try:
                 # Assuming deck_id can be a single ID or comma-separated list of IDs
                 deck_ids = [int(did) for did in deck_id_str.split(',') if did.strip()]
             except ValueError:
                 return jsonify(success=False, errors={'deck_id': 'Invalid deck ID format.'}), 400

             if deck_ids: # Only add condition if valid deck IDs are provided
                 deck_placeholders = ','.join(['%s'] * len(deck_ids))
                 conditions.append(f"d.id IN ({deck_placeholders})")
                 params.extend(deck_ids)


        # Combine conditions with AND
        if conditions:
            sql_query = sql_query_base + " AND " + " AND ".join(conditions)
        else:
            sql_query = sql_query_base # No extra conditions, select all user cards

        # Add grouping and ordering
        sql_query += """
            GROUP BY n.id, f.id, d.name, d.id, f.card_type, f.due_date 
            ORDER BY n.created_at DESC
            LIMIT 200 -- Basic limit, consider pagination
        """ 

        print(f"Executing search query for user {user_id}: {sql_query}") 
        print(f"Query parameters: {params}") 

        cur.execute(sql_query, tuple(params))
        cards_raw = cur.fetchall()

        results = []
        for card_raw in cards_raw:
            card_data = dict(card_raw)
            field_values = parse_field_values(card_data.get('field_values'))
            results.append({
                'note_id': card_data['note_id'],
                'flashcard_id': card_data['flashcard_id'],
                'front': field_values.get('Front', 'N/A'),
                'back': field_values.get('Back', 'N/A'),
                'deck_name': card_data['deck_name'],
                'deck_id': card_data['deck_id'],
                'card_type': card_data['card_type'],
                'due_date': card_data['due_date'].strftime('%Y-%m-%d') if card_data['due_date'] else 'N/A',
                'tags': card_data.get('note_tags') if card_data.get('note_tags') else ''
            })
        
        return jsonify(success=True, cards=results)

    except Exception as e:
        print(f"Error searching cards for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/api/decks/<int:deck_id>', methods=['DELETE'])
@login_required
def api_delete_deck(deck_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # Verify user owns the deck
        cur.execute("SELECT id FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id))
        deck = cur.fetchone()

        if not deck:
            return jsonify(success=False, errors={'deck': 'Deck not found or access denied'}), 404

        # Delete the deck. ON DELETE CASCADE in the database schema should
        # handle deleting related entries in deck_tags, flashcards, etc.
        # Deleting flashcards should cascade to notes and review_logs.
        cur.execute("DELETE FROM decks WHERE id = %s", (deck_id,))
        mysql.connection.commit()

        if cur.rowcount > 0:
            # Return the deleted deck ID so frontend can remove the card
            return jsonify(success=True, message='Deck deleted successfully', deleted_deck_id=deck_id)
        else:
             # Should not happen if the deck was found, but a safeguard
            return jsonify(success=False, message='Deck could not be deleted or was already deleted'), 400

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error deleting deck {deck_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/api/stats/dashboard', methods=['GET'])
@login_required
def api_get_dashboard_stats():
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # 1. Total Decks
        cur.execute("SELECT COUNT(*) as total_decks FROM decks WHERE user_id = %s", (user_id,))
        total_decks_data = cur.fetchone()
        total_decks = total_decks_data['total_decks'] if total_decks_data else 0

        # 2. Total Cards Learned/Mastered
        # Definition: card_type = 'review' AND ease_factor >= 2.8
        # This counts distinct flashcards that meet the mastery criteria.
        cur.execute("""
            SELECT COUNT(DISTINCT f.id) as cards_mastered
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE n.user_id = %s AND f.card_type = 'review' AND f.ease_factor >= 2.8
        """, (user_id,))
        cards_mastered_data = cur.fetchone()
        cards_mastered = cards_mastered_data['cards_mastered'] if cards_mastered_data else 0

        # 3. Total Study Time
        # This relies on 'review_sessions' table being populated correctly with 'time_spent_seconds'.
        # If 'time_spent_seconds' is not reliably populated, this will be inaccurate.
        cur.execute("""
            SELECT SUM(time_spent_seconds) as total_time_seconds
            FROM review_sessions
            WHERE user_id = %s AND session_end IS NOT NULL AND time_spent_seconds IS NOT NULL
        """, (user_id,))
        study_time_data = cur.fetchone()
        total_time_seconds = study_time_data['total_time_seconds'] if study_time_data and study_time_data['total_time_seconds'] is not None else 0

        total_time_hours = round(total_time_seconds / 3600, 1)

        # 4. Review Streak
        cur.execute("SELECT review_streak_days FROM user_stats WHERE user_id = %s", (user_id,))
        streak_data = cur.fetchone()
        review_streak_days = streak_data['review_streak_days'] if streak_data and streak_data['review_streak_days'] is not None else 0
        
        dashboard_stats = {
            'total_decks': total_decks,
            'cards_mastered': cards_mastered,
            'total_study_time_seconds': total_time_seconds,
            'total_study_time_formatted': f"{total_time_hours}h",
            'review_streak_days': review_streak_days
        }

        return jsonify(success=True, stats=dashboard_stats)

    except Exception as e:
        print(f"Error fetching dashboard stats for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/api/stats/performance', methods=['GET'])
@login_required
def api_get_performance_stats():
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # This API needs to provide data suitable for the performance chart on results.html
        # The chart canvas id is "performanceChart".
        # Example data: cards reviewed per day, average rating per day, accuracy over time.
        # Let's fetch daily review counts and average rating for the last 30 days.

        today = date.today()
        thirty_days_ago = today - timedelta(days=30)

        # Fetch reviews aggregated by day
        cur.execute("""
            SELECT 
                DATE(review_time) as review_date,
                COUNT(*) as total_reviews,
                AVG(rating) as average_rating -- Assuming rating 1-3 or 1-5
            FROM review_logs
            WHERE user_id = %s AND review_time >= %s
            GROUP BY DATE(review_time)
            ORDER BY review_date ASC
        """, (user_id, thirty_days_ago))

        daily_stats_raw = cur.fetchall()

        # Prepare data for Chart.js (Labels are dates, datasets are review counts and average ratings)
        dates = []
        review_counts = []
        average_ratings = []

        # Fill in dates with 0s for days with no reviews
        # Create a dictionary for quick lookup by date string
        daily_stats_dict = {str(day['review_date']): day for day in daily_stats_raw}

        for i in range(31): # Include today and the 30 previous days
            day = thirty_days_ago + timedelta(days=i)
            day_str = day.strftime('%Y-%m-%d')
            dates.append(day_str) # Date string for label

            stats_for_day = daily_stats_dict.get(day_str)
            if stats_for_day:
                review_counts.append(stats_for_day['total_reviews'])
                average_ratings.append(round(stats_for_day['average_rating'], 2)) # Round rating for display
            else:
                # No reviews on this day
                review_counts.append(0)
                average_ratings.append(None) # Use null for missing data in chart


        performance_data = {
            'labels': dates,
            'datasets': [
                {
                    'label': 'Cards Reviewed',
                    'data': review_counts,
                    'backgroundColor': 'rgba(54, 162, 235, 0.5)', # Example color
                    'borderColor': 'rgba(54, 162, 235, 1)',
                    'borderWidth': 1,
                    'yAxisID': 'y-reviews'
                },
                 {
                    'label': 'Average Rating',
                    'data': average_ratings,
                    'backgroundColor': 'rgba(75, 192, 192, 0.5)', # Example color
                    'borderColor': 'rgba(75, 192, 192, 1)',
                     'type': 'line', # Overlay as a line
                    'fill': False,
                    'yAxisID': 'y-rating',
                    'tension': 0.1 # Smoother line
                }
                # Add more datasets for accuracy etc. later
            ]
        }

        return jsonify(success=True, performance_data=performance_data)

    except Exception as e:
        print(f"Error fetching performance stats for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/api/stats/activity', methods=['GET'])
@login_required
def api_get_recent_activity():
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # Fetch recent activity from review_logs
        # Join with flashcards and decks to get relevant names
        cur.execute("""
            SELECT 
                rl.review_time,
                rl.rating,
                f.id as flashcard_id,
                d.name as deck_name,
                -- To get card content, would need to join notes and parse field_values (optional)
                -- n.field_values 
                rl.id as review_id # Unique ID for the log entry
            FROM review_logs rl
            JOIN flashcards f ON rl.flashcard_id = f.id
            JOIN decks d ON f.deck_id = d.id
            -- JOIN notes n ON f.note_id = n.id -- Uncomment if you need card content
            WHERE rl.user_id = %s
            ORDER BY rl.review_time DESC
            LIMIT 10 -- Fetch the last 10 activities
        """, (user_id,))

        recent_activity_raw = cur.fetchall()

        activity_list = []
        rating_descriptions = {1: 'Hard', 2: 'Good', 3: 'Easy'} # Map numerical rating to description

        for activity in recent_activity_raw:
            # Example formatting
            activity_type = "Reviewed" # Basic activity type for now
            description = f"Rated '{rating_descriptions.get(activity['rating'], 'N/A')}' on a card in '{activity['deck_name']}'"
            
            # If you needed card content:
            # field_values = parse_field_values(activity.get('field_values'))
            # description = f"Reviewed card '{field_values.get('Front', 'N/A')}' in '{activity['deck_name']}'"


            activity_list.append({
                'id': activity['review_id'], # Using review log ID as activity ID
                'type': activity_type,
                'description': description,
                'time': activity['review_time'].isoformat(), # Send ISO format timestamp
                # Add icon class based on rating/type if needed for frontend
                'icon': 'fas fa-check' # Generic icon for review, customize based on rating if needed
            })

        # You might also add other activity types here, like "Created Deck", "Added Cards" etc.
        # These would need querying other tables (decks, notes) and potentially a UNION or separate fetches.

        return jsonify(success=True, activity=activity_list)

    except Exception as e:
        print(f"Error fetching recent activity for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/create-deck')
@login_required
def createDeck():
    return render_template('create-deck.html')

@app.route('/decks/<int:deck_id>/edit')
@login_required
def edit_deck_page(deck_id):
    # We just need to pass the deck_id to the template.
    # The actual deck data and cards will be fetched via API by the frontend JS.
    # Verify the user owns this deck first for security
    cur = mysql.connection.cursor()
    cur.execute("SELECT user_id FROM decks WHERE id = %s", (deck_id,))
    deck = cur.fetchone()
    cur.close()

    if not deck:
        flash("Deck not found.", "error")
        return redirect(url_for('dashboard'))
    if deck['user_id'] != session['user_id']:
        flash("You do not have permission to edit this deck.", "error")
        return redirect(url_for('dashboard'))
        
    return render_template('edit-deck.html', deck_id=deck_id)


def parse_field_values(field_values_json):
    try:
        if isinstance(field_values_json, str):
            # Attempt to load JSON, being mindful of potential double-escaped strings
            # This can happen if JSON is stringified multiple times.
            try:
                return json.loads(field_values_json)
            except json.JSONDecodeError:
                # If direct loading fails, try un-escaping if it looks like an escaped JSON string
                # e.g. "\"{\\\"Front\\\": \\\"Test\\\"}\""
                if field_values_json.startswith('"') and field_values_json.endswith('"'):
                    try:
                        return json.loads(json.loads(field_values_json)) # Try double-decode
                    except: # Fallback if double-decode also fails
                        pass
                # If it's not JSON or malformed, return a default
                return {'Front': 'Error: Malformed data', 'Back': ''}
        elif isinstance(field_values_json, dict):
            return field_values_json # Already a dict
        return {'Front': 'Error: Invalid data format', 'Back': ''} # Default for other unexpected types
    except (json.JSONDecodeError, TypeError) as e:
        print(f"Error parsing field_values: {field_values_json}, Error: {e}")
        return {'Front': 'Error loading content', 'Back': ''}



@app.route('/api/decks/create-custom', methods=['POST'])
@login_required
def api_create_custom_deck():
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format, JSON expected'}), 400

    deck_name = data.get('name')
    note_ids = data.get('note_ids') # Expected to be a list of integers

    if not deck_name or not deck_name.strip():
        return jsonify(success=False, errors={'name': 'Deck name is required'}), 400
    
    if not note_ids or not isinstance(note_ids, list) or not all(isinstance(nid, int) for nid in note_ids):
        return jsonify(success=False, errors={'note_ids': 'A valid list of note IDs is required'}), 400
    
    if not note_ids: # Check if the list is empty after validation
        return jsonify(success=False, errors={'note_ids': 'At least one card (note) must be selected'}), 400

    cur = mysql.connection.cursor()
    try:
        # 1. Create the new deck
        cur.execute(
            "INSERT INTO decks (user_id, name, description) VALUES (%s, %s, %s)",
            (user_id, deck_name.strip(), "Custom deck created from card browser.") # Default description
        )
        new_deck_id = cur.lastrowid

        # 2. For each selected note, create a new flashcard in the new deck
        # We'll copy the note reference but treat the card as 'new' in this custom deck.
        # This assumes one primary flashcard type per note for simplicity when copying.
        # If a note can generate multiple types of flashcards, this logic might need adjustment
        # to decide which template/card_type to use for the new flashcard or if all should be copied.

        flashcards_created_count = 0
        for note_id in note_ids:
            # Verify the note belongs to the user (important!)
            cur.execute("SELECT id FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id))
            note = cur.fetchone()
            if not note:
                print(f"Skipping note_id {note_id} as it doesn't belong to user {user_id} or doesn't exist.")
                continue # Skip if note not found or not owned

            # Insert a new flashcard for this note into the new deck.
            # It will be a 'new' card, ready for learning in this specific deck context.
            # Default values for a new card:
            cur.execute(
                """
                INSERT INTO flashcards (note_id, deck_id, card_type, due_date, ease_factor, reps, intervals, last_reviewed)
                VALUES (%s, %s, 'new', CURDATE(), 2.5, 0, 0, NULL) 
                """,
                (note_id, new_deck_id)
            )
            if cur.rowcount > 0:
                flashcards_created_count += 1
        
        if flashcards_created_count == 0 and len(note_ids) > 0:
            # This case might happen if all note_ids were invalid/not owned.
            # Rollback deck creation if no cards were actually added.
            mysql.connection.rollback()
            return jsonify(success=False, errors={'note_ids': 'No valid cards could be added to the new deck.'}), 400

        mysql.connection.commit()

        # Fetch the newly created deck's details to return
        cur.execute("""
            SELECT d.id, d.name, d.description, d.created_at, 
                   (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) as card_count,
                   GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.id = %s
            GROUP BY d.id
        """, (new_deck_id,))
        new_deck_data = cur.fetchone()
        
        # Calculate mastered percentage for the new deck (will be 0 initially for new cards)
        if new_deck_data:
            new_deck_data = dict(new_deck_data) # Make it mutable
            new_deck_data['mastered_percentage'] = 0 


        return jsonify(success=True, message=f'Deck "{deck_name}" created with {flashcards_created_count} cards.', deck=new_deck_data), 201

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error creating custom deck: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/api/decks/<int:deck_id>/cards', methods=['GET'])
@login_required
def api_get_deck_cards(deck_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # First, verify ownership and get deck details
        cur.execute("""
            SELECT d.id, d.name, d.description, GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.id = %s AND d.user_id = %s
            GROUP BY d.id
        """, (deck_id, user_id))
        deck_info = cur.fetchone()

        if not deck_info:
            return jsonify(success=False, errors={'general': 'Deck not found or access denied'}), 404

        # Now, get the cards (notes associated with flashcards in this deck)
        cur.execute("""
            SELECT 
                n.id as note_id, 
                f.id as flashcard_id, 
                n.field_values,
                f.card_type, 
                f.due_date,
                f.ease_factor,
                f.intervals,
                f.reps,
                f.lapses,
                f.last_reviewed
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE f.deck_id = %s AND n.user_id = %s 
            ORDER BY n.created_at ASC 
        """, (deck_id, user_id)) # Ensure note also belongs to user
        
        cards_raw = cur.fetchall()
        
        # Parse the field_values JSON for each card
        cards_list = []
        for card_raw in cards_raw:
            card_data = dict(card_raw) # Make it a mutable dict
            field_values = parse_field_values(card_data.get('field_values'))
            # Structure the response clearly
            cards_list.append({
                'note_id': card_data['note_id'],
                'flashcard_id': card_data['flashcard_id'],
                'front': field_values.get('Front', ''), # Extract front/back assuming 'Basic' note type
                'back': field_values.get('Back', ''),
                'card_type': card_data.get('card_type'),
                'due_date': card_data.get('due_date'),
                # Include other flashcard fields if needed by frontend
            })

        return jsonify(success=True, deck=deck_info, cards=cards_list)

    except Exception as e:
        print(f"Error fetching deck cards: {e}")
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/api/notes/<int:note_id>', methods=['PUT'])
@login_required
def api_update_note(note_id):
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format, JSON expected'}), 400

    front_text = data.get('front')
    back_text = data.get('back')

    if not front_text or not back_text: # Allow empty? For now, require both.
        return jsonify(success=False, errors={'content': 'Front and Back text are required'}), 400

    cur = mysql.connection.cursor()
    try:
        # Verify user owns the note
        cur.execute("SELECT id FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id))
        note = cur.fetchone()
        if not note:
            return jsonify(success=False, errors={'note': 'Note not found or access denied'}), 404

        # Assuming this note is of a type where 'Front' and 'Back' are the fields
        field_values_json = json.dumps({'Front': front_text, 'Back': back_text})

        cur.execute(
            "UPDATE notes SET field_values = %s WHERE id = %s",
            (field_values_json, note_id)
        )
        mysql.connection.commit()
        
        # Optionally, fetch and return the updated note/flashcard data
        # For now, just success
        updated_card_data = {
            'note_id': note_id,
            'front': front_text,
            'back': back_text,
        }
        return jsonify(success=True, message='Note updated successfully', card=updated_card_data)

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error updating note: {e}")
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
@login_required
def api_delete_note(note_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # Verify user owns the note
        cur.execute("SELECT id FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id))
        note = cur.fetchone()
        if not note:
            return jsonify(success=False, errors={'note': 'Note not found or access denied'}), 404

        # The ON DELETE CASCADE on flashcards.note_id should handle flashcard deletion.
        # Also ON DELETE CASCADE for note_tags.
        cur.execute("DELETE FROM notes WHERE id = %s", (note_id,))
        mysql.connection.commit()

        if cur.rowcount > 0:
            return jsonify(success=True, message='Note and associated flashcards deleted successfully')
        else:
            # Should not happen if ownership check passed and note existed, but as a safeguard
            return jsonify(success=False, message='Note could not be deleted or was already deleted'), 400


    except Exception as e:
        mysql.connection.rollback()
        print(f"Error deleting note: {e}")
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/api/decks/<int:deck_id>/cards', methods=['POST'])
@login_required
def api_add_card_to_deck(deck_id):
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format, JSON expected'}), 400

    front_text = data.get('front')
    back_text = data.get('back')

    if not front_text or not back_text:
        return jsonify(success=False, errors={'content': 'Front and Back text are required'}), 400

    cur = mysql.connection.cursor()
    try:
        # Verify user owns the deck
        cur.execute("SELECT id FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id))
        deck = cur.fetchone()
        if not deck:
            return jsonify(success=False, errors={'deck': 'Deck not found or access denied'}), 404

        # Assume default note_type_id = 1 (Basic)
        default_note_type_id = 1 
        # Ensure this note type exists (as done in api_create_deck, or manage note types properly)
        cur.execute("SELECT id FROM note_types WHERE id = %s", (default_note_type_id,))
        if not cur.fetchone():
             cur.execute( # Simplified creation
                "INSERT IGNORE INTO note_types (id, name, fields, templates) VALUES (%s, %s, %s, %s)",
                (default_note_type_id, 'Basic', '["Front", "Back"]', '{"Default Card": {"front_template": "{{Front}}", "back_template": "{{Back}}"}}')
            )

        field_values_json = json.dumps({'Front': front_text, 'Back': back_text})

        cur.execute(
            "INSERT INTO notes (user_id, note_type_id, field_values) VALUES (%s, %s, %s)",
            (user_id, default_note_type_id, field_values_json)
        )
        note_id = cur.lastrowid

        cur.execute(
            """
            INSERT INTO flashcards (note_id, deck_id, card_type, due_date, ease_factor, reps, intervals)
            VALUES (%s, %s, 'new', CURDATE(), 2.5, 0, 0)
            """,
            (note_id, deck_id)
        )
        flashcard_id = cur.lastrowid
        mysql.connection.commit()

        cur.execute("SELECT due_date FROM flashcards WHERE id = %s", (flashcard_id,))
        flashcard_info = cur.fetchone()
        due_date_str = flashcard_info['due_date'].strftime('%Y-%m-%d') if flashcard_info and flashcard_info['due_date'] else datetime.today().strftime('%Y-%m-%d')


        new_card_data = {
            'note_id': note_id,
            'flashcard_id': flashcard_id,
            'front': front_text,  # These are from the input
            'back': back_text,    # These are from the input
            'card_type': 'new',   # This is hardcoded for new cards
            'due_date': due_date_str # Make sure this is a string if JS expects it
        }
        return jsonify(success=True, message='Card added successfully', card=new_card_data), 201

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error adding card to deck: {e}")
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html')

@app.route('/api/profile', methods=['GET'])
@login_required
def api_get_profile():
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        cur.execute("""
            SELECT id, username, email, date_of_birth, gender, country, city, created_at
            FROM users
            WHERE id = %s
        """, (user_id,))
        user_data = cur.fetchone()

        if not user_data:
             return jsonify(success=False, errors={'general': 'User not found'}), 404

        # Fetch user settings (SRA related)
        cur.execute("""
            SELECT new_cards_per_day, max_reviews_per_day, learning_steps, ease_bonus
            FROM settings
            WHERE user_id = %s
        """, (user_id,))
        settings_data = cur.fetchone()

        # Provide default settings if none exist
        if not settings_data:
             settings_data = {
                 'new_cards_per_day': 20,
                 'max_reviews_per_day': 100,
                 'learning_steps': '1,10',
                 'ease_bonus': 1.3
             }

        profile_data = dict(user_data)
        profile_data['settings'] = settings_data

        if profile_data.get('date_of_birth'):
            profile_data['date_of_birth'] = profile_data['date_of_birth'].strftime('%Y-%m-%d')

        return jsonify(success=True, profile=profile_data)

    except Exception as e:
        print(f"Error fetching user profile for user {user_id}: {e}")
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/api/profile', methods=['PUT'])
@login_required
def api_update_profile():
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format, JSON expected'}), 400

    username = data.get('username')
    email = data.get('email')
    # date_of_birth, gender, country, city updates omitted for simplicity based on HTML form
    timezone = data.get('timezone') # Timezone storage needs definition (maybe add to users or settings table?)

    # Assuming SRA settings are potentially updated via this form/API
    settings_data_payload = data.get('settings', {})
    new_cards_per_day = settings_data_payload.get('new_cards_per_day')
    max_reviews_per_day = settings_data_payload.get('max_reviews_per_day')
    learning_steps = settings_data_payload.get('learning_steps')
    ease_bonus = settings_data_payload.get('ease_bonus')


    cur = mysql.connection.cursor()

    try:
        update_fields = []
        update_values = []

        if username is not None:
             if not username.strip():
                 return jsonify(success=False, errors={'username': 'Username cannot be empty'}), 400
             update_fields.append("username = %s")
             update_values.append(username.strip())

        if email is not None:
            email = email.strip()
            if not email:
                 return jsonify(success=False, errors={'email': 'Email cannot be empty'}), 400
            cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (email, user_id))
            existing_user = cur.fetchone()
            if existing_user:
                 return jsonify(success=False, errors={'email': 'Email address is already in use'}), 409

            update_fields.append("email = %s")
            update_values.append(email)
            session['email'] = email # Update session

        # Add timezone update if storing it in `users` or `settings`
        # if timezone is not None:
        #    update_fields.append("timezone_field = %s") # Assuming a 'timezone_field' column
        #    update_values.append(timezone)

        if update_fields:
            update_query = "UPDATE users SET " + ", ".join(update_fields) + " WHERE id = %s"
            update_values.append(user_id)
            cur.execute(update_query, tuple(update_values))
            if 'username = %s' in update_fields:
                 session['username'] = username.strip()

        # Update settings table (SRA settings)
        # First, fetch existing settings to merge with payload
        cur.execute("""
            SELECT new_cards_per_day, max_reviews_per_day, learning_steps, ease_bonus
            FROM settings WHERE user_id = %s
        """, (user_id,))
        existing_settings = cur.fetchone()

        # Use payload value if provided, otherwise use existing/default
        settings_to_save = {
            'new_cards_per_day': new_cards_per_day if new_cards_per_day is not None else (existing_settings['new_cards_per_day'] if existing_settings else 20),
            'max_reviews_per_day': max_reviews_per_day if max_reviews_per_day is not None else (existing_settings['max_reviews_per_day'] if existing_settings else 100),
            'learning_steps': learning_steps if learning_steps is not None else (existing_settings['learning_steps'] if existing_settings else '1,10'),
            'ease_bonus': ease_bonus if ease_bonus is not None else (existing_settings['ease_bonus'] if existing_settings else 1.3)
        }
        
        # Ensure correct types (especially int/float)
        try:
            settings_to_save['new_cards_per_day'] = int(settings_to_save['new_cards_per_day'])
            settings_to_save['max_reviews_per_day'] = int(settings_to_save['max_reviews_per_day'])
            settings_to_save['ease_bonus'] = float(settings_to_save['ease_bonus'])
            # learning_steps might need format validation
        except (ValueError, TypeError):
             return jsonify(success=False, errors={'settings': 'Invalid format for setting values'}), 400


        settings_update_query = """
            INSERT INTO settings (user_id, new_cards_per_day, max_reviews_per_day, learning_steps, ease_bonus)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                new_cards_per_day = VALUES(new_cards_per_day),
                max_reviews_per_day = VALUES(max_reviews_per_day),
                learning_steps = VALUES(learning_steps),
                ease_bonus = VALUES(ease_bonus)
        """
        cur.execute(
            settings_update_query,
            (user_id, settings_to_save['new_cards_per_day'], settings_to_save['max_reviews_per_day'], settings_to_save['learning_steps'], settings_to_save['ease_bonus'])
        )

        mysql.connection.commit()

        cur.execute("""
            SELECT id, username, email, date_of_birth, gender, country, city, created_at
            FROM users
            WHERE id = %s
        """, (user_id,))
        updated_user_data = cur.fetchone()

        cur.execute("""
            SELECT new_cards_per_day, max_reviews_per_day, learning_steps, ease_bonus
            FROM settings
            WHERE user_id = %s
        """, (user_id,))
        updated_settings_data = cur.fetchone()

        updated_profile_data = dict(updated_user_data)
        updated_profile_data['settings'] = updated_settings_data
        if updated_profile_data.get('date_of_birth'):
            updated_profile_data['date_of_birth'] = updated_profile_data['date_of_birth'].strftime('%Y-%m-%d')

        return jsonify(success=True, message='Profile updated successfully', profile=updated_profile_data)

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error updating user profile for user {user_id}: {e}")
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/results')
@login_required
def results():
    return render_template('results.html')

@app.route('/study')
@login_required
def study():
    deck = request.args.get('deck')
    return render_template('study.html', deck=deck)

@app.route('/api/signup', methods=['POST'])
def signup():
    name = request.form['name']
    email = request.form['email']
    password = request.form['password']
    dob = request.form['dob']
    gender = request.form['gender']
    country = request.form['country']
    city = request.form['city']

    try:
        hashedPassword = generate_password_hash(password)

        cur = mysql.connection.cursor()
        cur.execute(
            """
            INSERT INTO users (username, email, password_hash, date_of_birth, gender, country, city)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (name, email, hashedPassword, dob, gender, country, city)
        )

        mysql.connection.commit()
        cur.close()

        return jsonify({'success': True, 'redirect': url_for('auth', tab='login')})
    except Exception as e:
        print(f"Error During Signup: {e}")
        return jsonify({'success': False, 'errors': {'general': 'An error occurred during registration'}}), 500

@app.route('/api/login', methods=['POST'])
def login():
    email = request.form.get('email')
    password = request.form.get('password')
    remember = request.form.get('remember') == 'on'

    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        cur.close()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'success': False, 'errors': {'general': 'Invalid email or password'}}), 401

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['email'] = user['email']

        if remember:
            session.permanent = True
            app.permanent_session_lifetime = timedelta(days=30)

        return jsonify({'success': True, 'redirect': url_for('dashboard')})

    except Exception as e:
        print(f"Error During Login: {e}")
        return jsonify({'success': False, 'errors': {'general': 'An error occurred during login'}}), 500
    
@app.route('/api/logout')
@login_required
def logout():
    session.clear()
    flash('You have been logged out.', 'success')
    return redirect(url_for('auth', tab='login'))

@app.route('/api/check-auth')
def check_auth():
    if 'user_id' in session:
        # Return more details if the user is logged in
        return jsonify({
            'authenticated': True,
            'user_id': session['user_id'],
            'username': session.get('username'),
            'email': session.get('email')
            # Add any other relevant non-sensitive info you stored in the session
        })
    # If not authenticated, return the standard response
    return jsonify({'authenticated': False})


@app.route('/test-db')
def test_db():
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT 1")
        cur.close()
        return "✅ Database connected successfully!"
    except Exception as e:
        return f"❌ Database connection failed: {str(e)}"

@app.route('/show')
def show_env():
    return {
        "DB_USER": os.getenv("DB_USER"),
        "DB_PASSWORD": os.getenv("DB_PASSWORD"),
        "DB_NAME": os.getenv("DB_NAME"),
        "DB_HOST": os.getenv("DB_HOST"),
    }
@app.route('/api/decks', methods=['POST'])
@login_required
def api_create_deck():
    data = request.get_json()
    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format, JSON expected'}), 400

    deck_name = data.get('name')
    description = data.get('description', '')
    tags_str = data.get('tags', []) # Expecting a list of strings
    cards_data = data.get('cards', []) # Expecting a list of card objects

    if not deck_name or not deck_name.strip():
        return jsonify(success=False, errors={'name': 'Deck name is required'}), 400
    deck_name = deck_name.strip()

    user_id = session['user_id']
    cur = mysql.connection.cursor()
    deck_id = None
    tag_ids_for_notes = [] # List to store tag IDs to link to notes

    try:
        # 1. Insert into decks table
        cur.execute(
            "INSERT INTO decks (user_id, name, description) VALUES (%s, %s, %s)",
            (user_id, deck_name, description)
        )
        deck_id = cur.lastrowid
        if not deck_id:
             # This is a critical failure, should ideally not happen with auto-increment
             mysql.connection.rollback()
             return jsonify(success=False, errors={'general': 'Failed to create deck entry.'}), 500


        # 2. Handle tags (find/create tags and link to the deck, and collect IDs for notes)
        if tags_str:
            tag_names = [tag.strip() for tag in tags_str if isinstance(tag, str) and tag.strip()]
            for tag_name in tag_names:
                cur.execute("SELECT id FROM tags WHERE name = %s", (tag_name,))
                tag_result = cur.fetchone()
                tag_id = None # Initialize for this tag

                if tag_result:
                    tag_id = tag_result['id']
                else:
                    # Create the tag if it doesn't exist
                    try:
                        cur.execute("INSERT INTO tags (name) VALUES (%s)", (tag_name,))
                        tag_id = cur.lastrowid
                        if not tag_id:
                             # Could happen if INSERT IGNORE was used and ignored, or auto-increment issue
                             print(f"WARNING: Failed to get lastrowid for new tag '{tag_name}'")
                             continue # Skip linking this tag if ID wasn't generated
                    except Exception as e_insert:
                         print(f"Error inserting tag '{tag_name}': {e_insert}")
                         # Decide how to handle insert errors - continue or rollback?
                         # For now, continue but don't get an ID if insert failed
                         continue # Skip linking this tag if insert failed

                # If we have a valid tag_id (either found or created)
                if tag_id:
                    # Link tag to the deck
                    try:
                         cur.execute(
                            "INSERT INTO deck_tags (deck_id, tag_id) VALUES (%s, %s)",
                            (deck_id, tag_id)
                         )
                    except Exception as e_deck_tag:
                         print(f"Error linking deck {deck_id} to tag {tag_id}: {e_deck_tag}")
                         # Continue, but this link is missed

                    # === NEW: Store tag_id to link to notes later ===
                    tag_ids_for_notes.append(tag_id)

        # 3. Handle cards (create notes and flashcards)
        # Assume default note_type_id = 1 (Basic)
        default_note_type_id = 1 
        cur.execute("SELECT id FROM note_types WHERE id = %s", (default_note_type_id,))
        if not cur.fetchone():
             # Create a basic note type if it doesn't exist
             cur.execute(
                "INSERT IGNORE INTO note_types (id, name, fields, templates) VALUES (%s, %s, %s, %s)",
                (default_note_type_id, 'Basic', '["Front", "Back"]', '{"Default Card": {"front_template": "{{Front}}", "back_template": "{{Back}}"}}')
            )

        flashcards_created_count = 0
        for card_item in cards_data:
            front_text = card_item.get('front')
            back_text = card_item.get('back')

            if not front_text or not back_text:
                # Skip incomplete cards
                continue 

            field_values_json = json.dumps({'Front': front_text, 'Back': back_text})

            # Insert note
            cur.execute(
                "INSERT INTO notes (user_id, note_type_id, field_values) VALUES (%s, %s, %s)",
                (user_id, default_note_type_id, field_values_json)
            )
            note_id = cur.lastrowid
            if not note_id:
                 print(f"CRITICAL: Failed to get note_id after inserting note. Rolling back.")
                 mysql.connection.rollback()
                 return jsonify(success=False, errors={'general': 'Failed to create note for a card.'}), 500


            # === NEW: Link tags (collected from deck level) to this note ===
            if tag_ids_for_notes:
                 # Construct a single query for batch insert into note_tags
                 note_tag_values = [(note_id, tag_id) for tag_id in tag_ids_for_notes]
                 # Ensure there are values to insert
                 if note_tag_values:
                     # MySQLdb execute can often take a list of tuples for bulk inserts
                     # The SQL syntax is INSERT INTO ... VALUES (%s, %s), (%s, %s), ...
                     # But the standard execute method handles this by repeating the (%s, %s) tuple
                     # for each item in the list of tuples and flatting the params.
                     # Alternatively, build the query string manually for robustness/clarity:
                     placeholders = ', '.join(['(%s, %s)'] * len(note_tag_values))
                     flat_values = [item for sublist in note_tag_values for item in sublist] # Flatten list of tuples
                     
                     try:
                         cur.execute(
                            f"INSERT INTO note_tags (note_id, tag_id) VALUES {placeholders}",
                            tuple(flat_values)
                         )
                         # print(f"Inserted {cur.rowcount} entries into note_tags for note {note_id}") # Debug
                     except Exception as e_note_tag:
                         print(f"Error linking note {note_id} to tags {tag_ids_for_notes}: {e_note_tag}")
                         # Continue creating other cards, just miss the tags for this note.

            # Insert flashcard for this note in the current deck
            cur.execute(
                """
                INSERT INTO flashcards (note_id, deck_id, card_type, due_date, ease_factor, reps, intervals)
                VALUES (%s, %s, 'new', CURDATE(), 2.5, 0, 0) 
                """,
                (note_id, deck_id)
            )
            flashcard_id = cur.lastrowid
            if not flashcard_id:
                 print(f"CRITICAL: Failed to get flashcard_id for note {note_id}. Rolling back.")
                 mysql.connection.rollback()
                 return jsonify(success=False, errors={'general': 'Failed to create flashcard entry.'}), 500
            flashcards_created_count += 1


        # 4. Commit the transaction
        mysql.connection.commit()

        # 5. Fetch the newly created deck's details to return (including aggregated tags from deck_tags)
        cur.execute("""
            SELECT d.id, d.name, d.description, d.created_at, 
                   (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) as card_count,
                   GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags_on_deck -- Fetch tags linked to the deck
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.id = %s AND d.user_id = %s
            GROUP BY d.id
        """, (deck_id, user_id)) 
        new_deck_data_row = cur.fetchone()

        if new_deck_data_row:
            new_deck_data = dict(new_deck_data_row)
            new_deck_data['mastered_percentage'] = 0 # Default for new decks
            # The 'tags' key in the response payload will now contain tags from deck_tags
            new_deck_data['tags'] = new_deck_data.pop('tags_on_deck', None) # Rename the column back to 'tags' for frontend consistency
        else:
            # This case indicates a problem fetching data *after* commit, but creation succeeded
            print(f"ERROR: Could not fetch newly created deck data (ID: {deck_id}) after commit.")
            # Return a minimal success response
            return jsonify(success=True, message=f'Deck "{deck_name}" created successfully, but failed to fetch details. Deck ID: {deck_id}'), 201


        return jsonify(success=True, message=f'Deck "{deck_name}" and {flashcards_created_count} card(s) created successfully.', deck=new_deck_data), 201

    except Exception as e:
        # Catch any exception during the process and rollback
        print(f"Exception occurred during deck creation for user {user_id}: {e}")
        traceback.print_exc() # Print full traceback
        if mysql.connection: # Check if connection is still valid before trying rollback
             mysql.connection.rollback()
             print("Transaction rolled back.")
        else:
             print("No active MySQL connection to rollback.")

        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()
            # print("Database cursor closed.") # Optional debug log


@app.route('/api/decks', methods=['GET'])
@login_required
def api_get_decks():
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # Fetch decks along with total card count and mastered card count for each deck
        cur.execute("""
            SELECT 
                d.id, 
                d.name, 
                d.description, 
                d.created_at,
                (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) as card_count,
                (SELECT COUNT(*) 
                    FROM flashcards sf 
                    WHERE sf.deck_id = d.id AND sf.card_type = 'review' AND sf.ease_factor >= 2.8
                ) as mastered_cards_in_deck, -- Count of mastered cards in this specific deck
                GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.user_id = %s
            GROUP BY d.id, d.name, d.description, d.created_at
            ORDER BY d.created_at DESC
        """, (user_id,))
        
        decks_raw = cur.fetchall()
        
        decks_with_progress = []
        for deck_row in decks_raw:
            deck_data = dict(deck_row) # Convert from DictRow to a mutable dict
            
            card_count = deck_data.get('card_count', 0)
            mastered_count = deck_data.get('mastered_cards_in_deck', 0)

            if card_count > 0:
                deck_data['mastered_percentage'] = round((mastered_count / card_count) * 100, 0)
            else:
                deck_data['mastered_percentage'] = 0
            
            # No need to delete 'mastered_cards_in_deck' as it's not sent to frontend by default if not accessed
            decks_with_progress.append(deck_data)

        return jsonify(success=True, decks=decks_with_progress)

    except Exception as e:
        print(f"Error fetching decks: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()
        
def parse_field_values(field_values_json):
    try:
        # Assumes field_values_json is a JSON string like '{"Front": "...", "Back": "..."}'
        # Or handles if it's directly a dict (though DB stores as string)
        if isinstance(field_values_json, str):
             # Handle potential escaping if needed, though json.loads is usually robust
             return json.loads(field_values_json)
        elif isinstance(field_values_json, dict):
            return field_values_json # Already a dict, though unexpected from DB fetch
        return {'Front': 'Error: Invalid data', 'Back': ''} # Default for unexpected types
    except (json.JSONDecodeError, TypeError):
        return {'Front': 'Error loading content', 'Back': ''} # Handle parsing errors

@app.route('/api/study/session/<int:deck_id>', methods=['GET'])
@login_required
def api_get_study_cards(deck_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    print(f"\n--- api_get_study_cards (Deck ID: {deck_id}, User ID: {user_id}) ---")

    try:
        cur.execute("SELECT id FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id))
        deck = cur.fetchone()
        if not deck:
            print(f"Deck {deck_id} not found or access denied for user {user_id}")
            return jsonify(success=False, errors={'deck': 'Deck not found or access denied'}), 404

        cur.execute("""
            SELECT new_cards_per_day, max_reviews_per_day
            FROM settings
            WHERE user_id = %s
        """, (user_id,))
        user_settings = cur.fetchone()

        new_cards_limit = user_settings['new_cards_per_day'] if user_settings and user_settings['new_cards_per_day'] is not None else 20
        review_cards_limit = user_settings['max_reviews_per_day'] if user_settings and user_settings['max_reviews_per_day'] is not None else 100
        print(f"User {user_id} study limits: New={new_cards_limit}, Review={review_cards_limit}")

        today = date.today()

        # --- Fetch new cards ---
        new_cards_query = """
            SELECT
                f.id as flashcard_id,
                n.id as note_id,
                n.field_values,
                f.card_type,
                f.due_date,
                f.ease_factor,
                f.intervals,
                f.reps,
                f.lapses,
                f.created_at
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE f.deck_id = %s AND n.user_id = %s AND f.card_type = 'new'
            ORDER BY f.created_at DESC
            LIMIT %s
        """
        cur.execute(new_cards_query, (deck_id, user_id, new_cards_limit))
        new_cards = cur.fetchall()
        print(f"Query for NEW cards executed. Fetched {len(new_cards)} cards.")
        # print(f"Fetched NEW cards data: {new_cards}") # Optional: log card data

        # --- Fetch learning and review cards that are due ---
        review_cards_query = """
            SELECT
                f.id as flashcard_id,
                n.id as note_id,
                n.field_values,
                f.card_type,
                f.due_date,
                f.ease_factor,
                f.intervals,
                f.reps,
                f.lapses
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE f.deck_id = %s AND n.user_id = %s AND f.card_type != 'new' AND f.due_date <= %s
            ORDER BY f.due_date ASC, f.ease_factor ASC
            LIMIT %s
        """
        cur.execute(review_cards_query, (deck_id, user_id, today, review_cards_limit))
        review_cards = cur.fetchall()
        print(f"Query for DUE review/learning cards executed. Fetched {len(review_cards)} cards.")
        # print(f"Fetched DUE cards data: {review_cards}") # Optional: log card data

        # --- Combine and process cards ---
        all_cards_raw = list(new_cards) + list(review_cards)
        print(f"Combined {len(all_cards_raw)} total cards before processing.")

        cards_for_study = []
        for card_raw in all_cards_raw:
            card_data = dict(card_raw)
            field_values = parse_field_values(card_data.get('field_values'))
            cards_for_study.append({
                'flashcard_id': card_data['flashcard_id'],
                'note_id': card_data['note_id'],
                'front': field_values.get('Front', ''),
                'back': field_values.get('Back', ''),
                'card_type': card_data.get('card_type'),
                'due_date': card_data.get('due_date').strftime('%Y-%m-%d') if card_data.get('due_date') else None,
                'ease_factor': card_data.get('ease_factor'),
                'intervals': card_data.get('intervals'),
                'reps': card_data.get('reps'),
                'lapses': card_data.get('lapses'),
            })

        print(f"Prepared {len(cards_for_study)} cards for study session after processing.")

        import random
        random.shuffle(cards_for_study)
        print(f"Cards for study session after shuffle (first 5): {cards_for_study[:5]}")

        return jsonify(success=True, deck_id=deck_id, cards=cards_for_study)

    except Exception as e:
        print(f"Error fetching study cards: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()




@app.route('/api/study/review/<int:flashcard_id>', methods=['POST'])
@login_required
def api_submit_review(flashcard_id):
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format, JSON expected'}), 400

    rating_text = data.get('rating')
    rating_map = {'hard': 1, 'good': 2, 'easy': 3}
    rating = rating_map.get(rating_text)

    if rating is None:
        return jsonify(success=False, errors={'rating': 'Invalid rating provided'}), 400

    cur = mysql.connection.cursor()
    try:
        today = date.today()

        # Fetch flashcard and associated note
        cur.execute("""
            SELECT f.*, n.user_id
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE f.id = %s
        """, (flashcard_id,))
        flashcard = cur.fetchone()

        if not flashcard or flashcard['user_id'] != user_id:
            return jsonify(success=False, errors={'flashcard': 'Flashcard not found or access denied'}), 404

        # --- Fetch User's SRA Settings ---
        cur.execute("""
            SELECT learning_steps, ease_bonus
            FROM settings
            WHERE user_id = %s
        """, (user_id,))
        user_settings = cur.fetchone()

        # Use user's settings or default values
        # Learning steps is a string like "1 10 1440". Need to parse it.
        # For this simple SRA, we primarily use ease_bonus.
        # A full SRA implementation would use learning_steps more extensively.
        # Let's just use ease_bonus for now, as per your simple SRA logic.
        ease_bonus = user_settings['ease_bonus'] if user_settings and user_settings['ease_bonus'] is not None else 1.3

        # --- Spaced Repetition Algorithm (Using User Settings) ---
        current_interval = flashcard['intervals']
        current_ease_factor = flashcard['ease_factor']
        current_reps = flashcard['reps']
        current_lapses = flashcard['lapses']
        current_card_type = flashcard['card_type']
        last_reviewed = datetime.now()

        new_interval = current_interval
        new_ease_factor = current_ease_factor * ease_bonus # Apply user's initial ease bonus if needed (or just during first review?)
                                                          # Standard SM-2 applies EF * current_interval
                                                          # Let's stick to the previous simplified logic but use the fetched EF

        new_reps = current_reps + 1
        new_lapses = current_lapses
        new_card_type = 'review'

        # Standard SM-2 style interval and EF adjustment (adjusting previous logic to be closer to standard and use EF)
        if rating == 3: # Easy
            new_ease_factor = current_ease_factor + 0.15 # Increase EF
            if current_card_type == 'new':
                 new_interval = 6 # Example: Graduate New -> Review with 6 day interval
            elif current_card_type == 'learning':
                 new_interval = 1 # Example: Graduate Learning -> Review with 1 day interval
            else: # Review
                 new_interval = current_interval * new_ease_factor # Multiply current interval by new EF

            new_card_type = 'review'

        elif rating == 2: # Good
            # Ease factor doesn't change in standard SM-2 for Good
            if current_card_type == 'new':
                 new_interval = 1 # Example: Graduate New -> Review with 1 day interval
                 new_card_type = 'learning' # Often stays in learning briefly
                 # Let's keep it simple: New -> Good -> 1 day interval, card_type 'learning'
                 new_card_type = 'learning' # Stay in learning
            elif current_card_type == 'learning':
                 new_interval = max(current_interval + 1, 1) # Progress in learning, min 1 day
                 new_card_type = 'learning' # Stay in learning stage until 'Easy'
                 # Alternative (Simpler): Good graduates to review after first step
                 # new_interval = 1 # Graduate to review with 1 day interval
                 # new_card_type = 'review'
                 # Let's stick to Good keeps it in learning for now, until Easy press.
            else: # Review
                 new_interval = current_interval * new_ease_factor # Multiply current interval by new EF
                 new_card_type = 'review'


        elif rating == 1: # Hard
            new_ease_factor = current_ease_factor - 0.20 # Decrease EF
            new_lapses += 1
            new_interval = 1 # Reset interval to 1 day
            new_card_type = 'learning' # Move back to learning stage


        # Ensure ease factor stays within a reasonable range
        new_ease_factor = max(1.3, new_ease_factor)
        new_ease_factor = min(5.0, new_ease_factor)

        # Ensure minimum interval is 1 day for review/learning graduating
        # If rating is Hard (1), interval is 1. If rating is Good/Easy and card type is review, use calculated interval.
        # If rating is Good/Easy and card type is learning, use calculated learning interval.
        final_interval_days = new_interval
        if final_interval_days < 1:
            final_interval_days = 1 # Minimum interval is 1 day


        # Calculate next due date
        next_due_date = today + timedelta(days=int(round(final_interval_days)))


        # Update flashcard in DB
        cur.execute(
            """
            UPDATE flashcards
            SET
                card_type = %s,
                due_date = %s,
                intervals = %s,
                ease_factor = %s,
                reps = %s,
                lapses = %s,
                last_reviewed = %s
            WHERE id = %s
            """,
            (new_card_type, next_due_date, int(round(final_interval_days)), new_ease_factor, new_reps, new_lapses, last_reviewed, flashcard_id)
        )

        # Insert into review_logs
        cur.execute(
            """
            INSERT INTO review_logs (flashcard_id, user_id, rating, intervals_before, intervals_after, ease_factor_before, ease_factor_after)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (flashcard_id, user_id, rating, current_interval, int(round(final_interval_days)), current_ease_factor, new_ease_factor)
        )

        # Update user_stats (increment total reviews and manage streak - streak requires more complex logic)
        cur.execute(
            """
            INSERT INTO user_stats (user_id, total_reviews)
            VALUES (%s, 1)
            ON DUPLICATE KEY UPDATE total_reviews = total_reviews + 1
            """,
            (user_id,)
        )


        mysql.connection.commit()

        return jsonify(
            success=True,
            message='Review recorded',
            flashcard_id=flashcard_id,
            new_state={
                'card_type': new_card_type,
                'due_date': next_due_date.strftime('%Y-%m-%d'),
                'intervals': int(round(final_interval_days)),
                'ease_factor': round(new_ease_factor, 2),
                'reps': new_reps,
                'lapses': new_lapses
            }
        )

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error submitting review for flashcard {flashcard_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()



# Add this route in app.py
@app.route('/api/decks/<int:deck_id>', methods=['GET'])
@login_required
def api_get_deck_details(deck_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        # Query for specific deck details, including tags if needed
        cur.execute("""
            SELECT 
                d.id, 
                d.name, 
                d.description, 
                d.created_at,
                (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) as card_count,
                GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.id = %s AND d.user_id = %s
            GROUP BY d.id 
        """, (deck_id, user_id))
        
        deck = cur.fetchone()
        
        if deck:
            # Convert Row object to dictionary if necessary, DictCursor handles this
            return jsonify(success=True, deck=deck)
        else:
            return jsonify(success=False, errors={'deck': 'Deck not found or access denied'}), 404

    except Exception as e:
        print(f"Error fetching deck details for ID {deck_id}: {e}")
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

if __name__ == '__main__':
    app.run(debug=True)