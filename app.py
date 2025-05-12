from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
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
        # Definition of "mastered" can vary. Let's use a simple definition:
        # cards with ease_factor >= 2.5 and reps >= 3 (example criteria)
        # Or simpler: cards that have been reviewed successfully a few times (e.g., reps > 5)
        # Let's use a simple count of cards with reps > 0 for now (cards that have been seen at least once)
        # A better definition would involve a threshold on ease factor or number of reviews after graduating.
        # Let's use ease_factor >= 3.0 as a potential indicator of 'mastered' for now.
        cur.execute("""
            SELECT COUNT(DISTINCT f.id) as cards_mastered -- Count unique flashcards
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE n.user_id = %s AND f.ease_factor >= 3.0 -- Example criteria
        """, (user_id,))
        cards_mastered_data = cur.fetchone()
        cards_mastered = cards_mastered_data['cards_mastered'] if cards_mastered_data else 0

        # 3. Total Study Time
        # Assuming total_time_spent_seconds is tracked in user_stats or review_sessions
        # We can aggregate from review_sessions if available, or rely on user_stats
        cur.execute("""
            SELECT SUM(time_spent_seconds) as total_time_seconds
            FROM review_sessions
            WHERE user_id = %s AND session_end IS NOT NULL
        """, (user_id,))
        study_time_data = cur.fetchone()
        total_time_seconds = study_time_data['total_time_seconds'] if study_time_data and study_time_data['total_time_seconds'] is not None else 0

        # Convert seconds to a human-readable format (e.g., hours, minutes)
        total_time_hours = round(total_time_seconds / 3600, 1) # Round to 1 decimal place

        # 4. Review Streak (More complex - requires daily review tracking)
        # The user_stats table has review_streak_days, current_streak_start, last_reviewed_date
        # This requires logic during review submission (api_submit_review) to update the streak.
        # For now, fetch the raw streak value from user_stats.
        cur.execute("SELECT review_streak_days FROM user_stats WHERE user_id = %s", (user_id,))
        streak_data = cur.fetchone()
        review_streak_days = streak_data['review_streak_days'] if streak_data and streak_data['review_streak_days'] is not None else 0
        
        # If user_stats doesn't exist, review_streak_days will be 0, which is correct.


        dashboard_stats = {
            'total_decks': total_decks,
            'cards_mastered': cards_mastered,
            'total_study_time_seconds': total_time_seconds, # Raw value
            'total_study_time_formatted': f"{total_time_hours}h", # Formatted value for display
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
        return json.loads(field_values_json)
    except (json.JSONDecodeError, TypeError):
        # Handle cases where it might not be valid JSON or is None
        # Return a default structure or None based on expected usage
        return {'Front': 'Error: Invalid data', 'Back': ''} 

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
    tags_str = data.get('tags', []) # Expecting a list of strings now from JS
    cards_data = data.get('cards', []) # Expecting a list of card objects [{front: '', back: ''}, ...]

    if not deck_name:
        return jsonify(success=False, errors={'name': 'Deck name is required'}), 400

    user_id = session['user_id']
    cur = mysql.connection.cursor()

    try:
        # Insert into decks table
        cur.execute(
            "INSERT INTO decks (user_id, name, description) VALUES (%s, %s, %s)",
            (user_id, deck_name, description)
        )
        deck_id = cur.lastrowid

        # Handle tags
        if tags_str: # tags_str is now expected to be a list
            tag_names = [tag.strip() for tag in tags_str if isinstance(tag, str) and tag.strip()]
            for tag_name in tag_names:
                cur.execute("SELECT id FROM tags WHERE name = %s", (tag_name,))
                tag_result = cur.fetchone()
                if tag_result:
                    tag_id = tag_result['id']
                else:
                    cur.execute("INSERT INTO tags (name) VALUES (%s)", (tag_name,))
                    tag_id = cur.lastrowid
                
                cur.execute(
                    "INSERT INTO deck_tags (deck_id, tag_id) VALUES (%s, %s)",
                    (deck_id, tag_id)
                )
        
        # Handle cards
        # For simplicity, we'll use a default note_type_id. 
        # You might want to create a 'Basic' note type in your note_types table.
        # Let's assume note_type_id = 1 is a 'Basic (Front/Back)' type.
        default_note_type_id = 1 # IMPORTANT: Ensure this note_type exists or handle dynamically
        
        # Create a basic note type if it doesn't exist (for testing/simplicity)
        cur.execute("SELECT id FROM note_types WHERE id = %s", (default_note_type_id,))
        if not cur.fetchone():
            # This is a simplified way. In a real app, you'd manage note types more robustly.
            cur.execute(
                "INSERT IGNORE INTO note_types (id, name, fields, templates) VALUES (%s, %s, %s, %s)",
                (default_note_type_id, 'Basic', '["Front", "Back"]', '{"Default Card": {"front_template": "{{Front}}", "back_template": "{{Back}}"}}')
            )


        for card_item in cards_data:
            front_text = card_item.get('front')
            back_text = card_item.get('back')

            if not front_text or not back_text:
                # Optionally skip incomplete cards or return an error
                continue 

            # Store front/back as JSON in field_values
            # Matches the assumption of fields: '["Front", "Back"]' for the basic note type
            field_values_json = json.dumps({'Front': front_text, 'Back': back_text})

            cur.execute(
                """
                INSERT INTO notes (user_id, note_type_id, field_values) 
                VALUES (%s, %s, %s)
                """,
                (user_id, default_note_type_id, field_values_json)
            )
            note_id = cur.lastrowid

            # Create a flashcard for this note in the current deck
            # Set initial due_date to today (or NULL for new cards to be picked up by study query)
            cur.execute(
                """
                INSERT INTO flashcards (note_id, deck_id, card_type, due_date, ease_factor, reps, intervals)
                VALUES (%s, %s, 'new', CURDATE(), 2.5, 0, 0) 
                """,
                (note_id, deck_id)
            )

        mysql.connection.commit()
        
        cur.execute("""
            SELECT d.id, d.name, d.description, d.created_at, 
                   (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) as card_count,
                   GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.id = %s
            GROUP BY d.id
        """, (deck_id,))
        new_deck_data = cur.fetchone()

        return jsonify(success=True, message='Deck and cards created successfully', deck=new_deck_data), 201

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error creating deck/cards: {e}")
        # Be careful about exposing too much detail in error messages to the client
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/api/decks', methods=['GET'])
@login_required
def api_get_decks():
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        cur.execute("""
            SELECT 
                d.id, 
                d.name, 
                d.description, 
                d.created_at,
                (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) as card_count,
                GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags
                -- Add more fields for progress later, e.g.,
                -- (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id AND f.ease_factor > 3.0) as mastered_cards
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.user_id = %s
            GROUP BY d.id, d.name, d.description, d.created_at
            ORDER BY d.created_at DESC
        """, (user_id,))
        
        decks = cur.fetchall()
        
        
        decks_with_progress = []
        for deck in decks:
            deck_data = dict(deck) # Convert from DictRow to a mutable dict
            # Placeholder for mastered percentage
            # In a real scenario, calculate this based on flashcard status
            if deck_data['card_count'] > 0:
                 # Example: Fetch actual mastered cards
                # cur.execute("SELECT COUNT(*) as mastered FROM flashcards WHERE deck_id = %s AND ease_factor >= %s", (deck_data['id'], 2.5)) # Example threshold
                # mastered_info = cur.fetchone()
                # deck_data['mastered_percentage'] = (mastered_info['mastered'] / deck_data['card_count']) * 100 if mastered_info else 0
                deck_data['mastered_percentage'] = 0 # Placeholder
            else:
                deck_data['mastered_percentage'] = 0
            decks_with_progress.append(deck_data)

        return jsonify(success=True, decks=decks_with_progress)

    except Exception as e:
        print(f"Error fetching decks: {e}")
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