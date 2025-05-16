from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash
import traceback
import config # Make sure config.py exists and is configured
from functools import wraps
import json
from datetime import datetime, timedelta, date
import os # Added for show_env, ensure it's used or remove show_env

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
            if request.accept_mimetypes.accept_json and \
               not request.accept_mimetypes.accept_html or \
               request.path.startswith('/api/'):
                return jsonify(success=False, errors={'general': 'Authentication required'}), 401
            else:
                flash('Please log in to access this page.', 'warning')
                return redirect(url_for('auth', tab='login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/leaderboard')
@login_required
def leaderboard_page():
    return render_template('leaderboard.html')

@app.route('/api/admin/populate-leaderboard', methods=['POST'])
@login_required # Ensure only authorized users can do this if it's sensitive
def admin_populate_leaderboard_snapshot():
    cur = None
    try:
        cur = mysql.connection.cursor()

        # Clear out the old snapshot before creating a new one
        cur.execute("TRUNCATE TABLE leaderboard_snapshots;")

        sql_populate_mysql8 = """
            INSERT INTO leaderboard_snapshots (user_id, username, points, `rank`, captured_at)
            SELECT
                u.id AS user_id,
                u.username,
                us.points,
                RANK() OVER (ORDER BY us.points DESC) AS `rank`,
                NOW() AS captured_at
            FROM users u
            JOIN user_stats us ON u.id = us.user_id
            WHERE us.points > 0  -- Only include users who have earned points
            ORDER BY us.points DESC
            LIMIT 1000;          -- Limit the size of the snapshot
        """

        cur.execute(sql_populate_mysql8)

        rows_inserted = cur.rowcount # Get how many rows were inserted
        mysql.connection.commit()

        return jsonify(success=True, message=f"Leaderboard snapshot updated successfully. {rows_inserted} entries processed."), 200

    except Exception as e:
        if mysql.connection and hasattr(mysql.connection, 'rollback'):
            mysql.connection.rollback()
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f"An error occurred during leaderboard population: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()      


@app.route('/api/leaderboard', methods=['GET'])
@login_required
def api_get_leaderboard():
    user_id = session.get('user_id')
    page = request.args.get('page', 1, type=int)
    limit = max(1, request.args.get('limit', 50, type=int))
    offset = (page - 1) * limit

    cur = None
    try:
        cur = mysql.connection.cursor()

        # Query to count total users with points for pagination
        cur.execute("""
            SELECT COUNT(u.id) as total_entries
            FROM users u
            JOIN user_stats us ON u.id = us.user_id
            WHERE us.points > 0
        """)
        total_entries_data = cur.fetchone()
        total_entries = total_entries_data['total_entries'] if total_entries_data else 0

        total_pages = 0
        if total_entries > 0:
            total_pages = (total_entries + limit - 1) // limit
        
        if page > total_pages and total_pages > 0: # Adjust page if out of bounds
            page = total_pages
            offset = (page - 1) * limit
        elif total_entries == 0:
            page = 1
            offset = 0


       
        leaderboard_query_mysql8 = """
            SELECT
                u.id as user_id,
                u.username,
                us.points,
                RANK() OVER (ORDER BY us.points DESC) AS `rank`
            FROM users u
            JOIN user_stats us ON u.id = us.user_id
            WHERE us.points > 0
            ORDER BY us.points DESC, u.username ASC
            LIMIT %s OFFSET %s
        """
        leaderboard_query_older_mysql = """
            SELECT
                u.id as user_id,
                u.username,
                us.points
                -- Rank will be assigned in Python based on order
            FROM users u
            JOIN user_stats us ON u.id = us.user_id
            WHERE us.points > 0
            ORDER BY us.points DESC, u.username ASC
            LIMIT %s OFFSET %s
        """
        
        cur.execute(leaderboard_query_mysql8, (limit, offset))
        leaderboard_data = cur.fetchall()


        current_user_rank_info = None
        if user_id:
            current_user_rank_query_mysql8 = """
                SELECT user_id, username, points, `rank`
                FROM (
                    SELECT
                        u.id AS user_id,
                        u.username,
                        us.points,
                        RANK() OVER (ORDER BY us.points DESC) AS `rank`
                    FROM users u
                    JOIN user_stats us ON u.id = us.user_id
                    WHERE us.points > 0
                ) AS ranked_users
                WHERE user_id = %s
            """
            cur.execute(current_user_rank_query_mysql8, (user_id,))
            current_user_rank_info = cur.fetchone()

        return jsonify(
            success=True,
            leaderboard=leaderboard_data,
            current_user_rank=current_user_rank_info,
            pagination={
                'page': page,
                'limit': limit,
                'total_entries': total_entries,
                'total_pages': total_pages
            }
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred fetching leaderboard: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()
@app.route('/reviews')
@login_required
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
    user_id = session.get('user_id')
    if not user_id:
        return jsonify(success=False, errors={'general': 'Authentication required'}), 401

    cur = None
    try:
        cur = mysql.connection.cursor()
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
        return jsonify(success=True, tags=tags if tags else [])
    except Exception as e:
        return jsonify(success=False, errors={'general': f'An error occurred while fetching tags: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()

def parse_field_values_utility(field_values_json):
    if field_values_json is None:
        return {'Front': 'Error: No data provided', 'Back': ''}
    try:
        if isinstance(field_values_json, str):
            try:
                return json.loads(field_values_json)
            except json.JSONDecodeError:
                if field_values_json.startswith('"') and field_values_json.endswith('"'):
                    try:
                        return json.loads(json.loads(field_values_json)) 
                    except json.JSONDecodeError:
                        pass
                return {'Front': 'Error: Malformed content data', 'Back': ''}
        elif isinstance(field_values_json, dict):
            return field_values_json
        return {'Front': 'Error: Invalid content data format', 'Back': ''}
    except Exception:
        return {'Front': 'Error loading content due to an unexpected issue', 'Back': ''}


@app.route('/api/cards/search', methods=['GET'])
@login_required
def api_search_cards():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify(success=False, errors={'general': 'Authentication required'}), 401

    search_query_term = request.args.get('query', '').strip()
    tag_ids_str = request.args.get('tags', '') 
    deck_id_str = request.args.get('deck_id', '').strip() 

    cur = None
    try:
        cur = mysql.connection.cursor()
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

        if search_query_term:
            conditions.append("(n.field_values LIKE %s)")
            params.append(f"%{search_query_term}%")

        tag_ids = []
        if tag_ids_str:
            try:
                tag_ids = [int(tid) for tid in tag_ids_str.split(',') if tid.strip()]
            except ValueError:
                return jsonify(success=False, errors={'tags': 'Invalid tag ID format. Ensure IDs are numbers.'}), 400
            
            if tag_ids:
                placeholders = ','.join(['%s'] * len(tag_ids))
                conditions.append(f"n.id IN (SELECT nt_sub.note_id FROM note_tags nt_sub WHERE nt_sub.tag_id IN ({placeholders}))")
                params.extend(tag_ids)

        deck_ids = []
        if deck_id_str:
            try:
                deck_ids = [int(did) for did in deck_id_str.split(',') if did.strip()]
            except ValueError:
                return jsonify(success=False, errors={'deck_id': 'Invalid deck ID format. Ensure IDs are numbers.'}), 400

            if deck_ids:
                deck_placeholders = ','.join(['%s'] * len(deck_ids))
                conditions.append(f"d.id IN ({deck_placeholders})")
                params.extend(deck_ids)

        if conditions:
            sql_query = sql_query_base + " AND " + " AND ".join(conditions)
        else:
            sql_query = sql_query_base

        sql_query += """
            GROUP BY n.id, f.id, d.name, d.id, f.card_type, f.due_date 
            ORDER BY n.created_at DESC
            LIMIT 200 
        """ 

        cur.execute(sql_query, tuple(params))
        cards_raw = cur.fetchall()

        results = []
        for card_raw in cards_raw:
            if not card_raw:
                continue
                
            card_data = dict(card_raw)
            field_values = parse_field_values_utility(card_data.get('field_values'))
            due_date = card_data.get('due_date')
            
            results.append({
                'note_id': card_data.get('note_id'),
                'flashcard_id': card_data.get('flashcard_id'),
                'front': field_values.get('Front', 'N/A'),
                'back': field_values.get('Back', 'N/A'),
                'deck_name': card_data.get('deck_name'),
                'deck_id': card_data.get('deck_id'),
                'card_type': card_data.get('card_type'),
                'due_date': due_date.strftime('%Y-%m-%d') if due_date else 'N/A',
                'tags': card_data.get('note_tags', '')
            })
        
        return jsonify(success=True, cards=results)

    except Exception as e:
        return jsonify(success=False, errors={'general': f'An error occurred while searching cards: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()


@app.route('/api/decks/<int:deck_id>', methods=['DELETE'])
@login_required
def api_delete_deck(deck_id):
    user_id = session.get('user_id')
    if not user_id:
         return jsonify(success=False, errors={'general': 'Authentication required'}), 401

    if not isinstance(deck_id, int) or deck_id <= 0:
        return jsonify(success=False, errors={'deck': 'Invalid deck ID provided.'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT id FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id))
        deck = cur.fetchone()

        if not deck:
            return jsonify(success=False, errors={'deck': 'Deck not found or you do not have permission to delete it.'}), 404

        cur.execute("DELETE FROM decks WHERE id = %s", (deck_id,))
        mysql.connection.commit()

        if cur.rowcount > 0:
            return jsonify(success=True, message='Deck deleted successfully', deleted_deck_id=deck_id)
        else:
            return jsonify(success=False, message='Deck could not be deleted or was already deleted.'), 400

    except Exception as e:
        if mysql.connection and hasattr(mysql.connection, 'rollback'):
            mysql.connection.rollback()
        return jsonify(success=False, errors={'general': f'An error occurred while deleting deck: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()


@app.route('/api/stats/dashboard', methods=['GET'])
@login_required
def api_get_dashboard_stats():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify(success=False, errors={'general': 'Authentication required'}), 401
    
    cur = None
    try:
        cur = mysql.connection.cursor()
        
        cur.execute("SELECT COUNT(*) as total_decks FROM decks WHERE user_id = %s", (user_id,))
        total_decks_data = cur.fetchone()
        total_decks = total_decks_data['total_decks'] if total_decks_data else 0

        cur.execute("""
            SELECT COUNT(DISTINCT f.id) as cards_mastered
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE n.user_id = %s AND f.card_type = 'review' AND f.ease_factor >= 2.8
        """, (user_id,))
        cards_mastered_data = cur.fetchone()
        cards_mastered = cards_mastered_data['cards_mastered'] if cards_mastered_data else 0

        cur.execute("SELECT points, review_streak_days FROM user_stats WHERE user_id = %s", (user_id,))
        user_stats_data = cur.fetchone()
        
        current_points = 0
        review_streak_days = 0
        if user_stats_data:
            current_points = user_stats_data.get('points', 0) 
            review_streak_days = user_stats_data.get('review_streak_days', 0)
        
        dashboard_stats = {
            'total_decks': total_decks,
            'cards_mastered': cards_mastered,
            'points': current_points,
            'review_streak_days': review_streak_days 
        }

        return jsonify(success=True, stats=dashboard_stats)

    except Exception as e:
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred fetching dashboard stats: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()

@app.route('/api/stats/performance', methods=['GET'])
@login_required
def api_get_performance_stats():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify(success=False, errors={'general': 'Authentication required'}), 401

    cur = None
    try:
        cur = mysql.connection.cursor()
        today = date.today()
        thirty_days_ago = today - timedelta(days=30)

        cur.execute("""
            SELECT 
                DATE(review_time) as review_date,
                COUNT(*) as total_reviews,
                AVG(rating) as average_rating
            FROM review_logs
            WHERE user_id = %s AND review_time >= %s
            GROUP BY DATE(review_time)
            ORDER BY review_date ASC
        """, (user_id, thirty_days_ago))
        daily_stats_raw = cur.fetchall()

        dates = []
        review_counts = []
        average_ratings = []
        daily_stats_dict = {str(day['review_date']): day for day in daily_stats_raw if day and 'review_date' in day}

        for i in range(31):
            day = thirty_days_ago + timedelta(days=i)
            day_str = day.strftime('%Y-%m-%d')
            dates.append(day_str)

            stats_for_day = daily_stats_dict.get(day_str)
            if stats_for_day:
                review_counts.append(stats_for_day.get('total_reviews', 0))
                avg_rating = stats_for_day.get('average_rating')
                average_ratings.append(round(float(avg_rating), 2) if avg_rating is not None else None)
            else:
                review_counts.append(0)
                average_ratings.append(None)

        performance_data = {
            'labels': dates,
            'datasets': [
                {
                    'label': 'Cards Reviewed',
                    'data': review_counts,
                    'backgroundColor': 'rgba(54, 162, 235, 0.5)',
                    'borderColor': 'rgba(54, 162, 235, 1)',
                    'borderWidth': 1,
                    'yAxisID': 'y-reviews'
                },
                {
                    'label': 'Average Rating',
                    'data': average_ratings,
                    'backgroundColor': 'rgba(75, 192, 192, 0.5)',
                    'borderColor': 'rgba(75, 192, 192, 1)',
                    'type': 'line',
                    'fill': False,
                    'yAxisID': 'y-rating',
                    'tension': 0.1
                }
            ]
        }
        return jsonify(success=True, performance_data=performance_data)

    except Exception as e:
        return jsonify(success=False, errors={'general': f'An error occurred fetching performance stats: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()

@app.route('/api/stats/activity', methods=['GET'])
@login_required
def api_get_recent_activity():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify(success=False, errors={'general': 'Authentication required'}), 401

    cur = None
    try:
        cur = mysql.connection.cursor()
        cur.execute("""
            SELECT 
                rl.review_time,
                rl.rating,
                f.id as flashcard_id,
                d.name as deck_name,
                rl.id as review_id
            FROM review_logs rl
            JOIN flashcards f ON rl.flashcard_id = f.id
            JOIN decks d ON f.deck_id = d.id
            WHERE rl.user_id = %s
            ORDER BY rl.review_time DESC
            LIMIT 10
        """, (user_id,))
        recent_activity_raw = cur.fetchall()

        activity_list = []
        rating_descriptions = {1: 'Hard', 2: 'Good', 3: 'Easy', None: 'N/A'}

        for activity_item in recent_activity_raw:
            if not activity_item: 
                continue

            rating = activity_item.get('rating')
            deck_name = activity_item.get('deck_name', 'Unknown Deck')
            
            description = f"Rated '{rating_descriptions.get(rating, 'N/A')}' on a card in '{deck_name}'"
            review_time = activity_item.get('review_time')
            
            activity_list.append({
                'id': activity_item.get('review_id'),
                'type': "Reviewed",
                'description': description,
                'time': review_time.isoformat() if review_time else None,
                'icon': 'fas fa-check' 
            })

        return jsonify(success=True, activity=activity_list)

    except Exception as e:
        return jsonify(success=False, errors={'general': f'An error occurred fetching recent activity: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()

@app.route('/create-deck')
@login_required
def createDeck():
    return render_template('create-deck.html')

@app.route('/decks/<int:deck_id>/edit')
@login_required
def edit_deck_page(deck_id):
    user_id = session.get('user_id')
    if not user_id:
        flash("Authentication required.", "error")
        return redirect(url_for('auth', tab='login'))

    if not isinstance(deck_id, int) or deck_id <= 0:
        flash("Invalid deck identifier.", "error")
        return redirect(url_for('dashboard'))

    cur = None
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT user_id FROM decks WHERE id = %s", (deck_id,))
        deck = cur.fetchone()
        
        if not deck:
            flash("Deck not found.", "error")
            return redirect(url_for('dashboard'))
            
        if deck['user_id'] != user_id:
            flash("You do not have permission to edit this deck.", "error")
            return redirect(url_for('dashboard'))
            
        return render_template('edit-deck.html', deck_id=deck_id)
        
    except Exception as e:
        flash("An error occurred while retrieving deck information.", "error")
        return redirect(url_for('dashboard'))
    finally:
        if cur:
            cur.close()

@app.route('/api/decks/create-custom', methods=['POST'])
@login_required
def api_create_custom_deck():
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format, JSON expected'}), 400

    deck_name = data.get('name', '').strip()
    note_ids = data.get('note_ids')

    if not deck_name:
        return jsonify(success=False, errors={'name': 'Deck name is required'}), 400
    
    if not note_ids or not isinstance(note_ids, list) or not all(isinstance(nid, int) for nid in note_ids):
        return jsonify(success=False, errors={'note_ids': 'A valid list of note IDs is required'}), 400
    
    if not note_ids:
        return jsonify(success=False, errors={'note_ids': 'At least one card (note) must be selected'}), 400

    cur = mysql.connection.cursor()
    try:
        cur.execute(
            "INSERT INTO decks (user_id, name, description) VALUES (%s, %s, %s)",
            (user_id, deck_name, "Custom deck created from card browser.")
        )
        new_deck_id = cur.lastrowid

        flashcards_created_count = 0
        for note_id in note_ids:
            cur.execute("SELECT id FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id))
            note = cur.fetchone()
            if not note:
                continue

            cur.execute(
                """
                INSERT INTO flashcards (note_id, deck_id, card_type, due_date, ease_factor, reps, intervals, last_reviewed)
                VALUES (%s, %s, 'new', CURDATE(), 2.5, 0, 0, NULL) 
                """,
                (note_id, new_deck_id)
            )
            if cur.rowcount > 0:
                flashcards_created_count += 1
        
        if flashcards_created_count == 0:
            mysql.connection.rollback()
            return jsonify(success=False, errors={'note_ids': 'No valid cards could be added to the new deck.'}), 400

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
        """, (new_deck_id,))
        new_deck_data = cur.fetchone()
        
        if new_deck_data:
            new_deck_data = dict(new_deck_data)
            new_deck_data['mastered_percentage'] = 0 

        return jsonify(success=True, message=f'Deck "{deck_name}" created with {flashcards_created_count} cards.', deck=new_deck_data), 201

    except Exception as e:
        mysql.connection.rollback()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/api/decks/<int:deck_id>/cards', methods=['GET'])
@login_required
def api_get_deck_cards(deck_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
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
        """, (deck_id, user_id))
        
        cards_raw = cur.fetchall()
        
        cards_list = []
        for card_raw in cards_raw:
            if not card_raw:
                continue
                
            card_data = dict(card_raw)
            field_values = parse_field_values_utility(card_data.get('field_values'))
            
            cards_list.append({
                'note_id': card_data['note_id'],
                'flashcard_id': card_data['flashcard_id'],
                'front': field_values.get('Front', ''),
                'back': field_values.get('Back', ''),
                'card_type': card_data.get('card_type'),
                'due_date': card_data.get('due_date'),
            })

        return jsonify(success=True, deck=deck_info, cards=cards_list)

    except Exception as e:
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

    front_text = data.get('front', '').strip()
    back_text = data.get('back', '').strip()

    if not front_text or not back_text:
        return jsonify(success=False, errors={'content': 'Front and Back text are required'}), 400

    cur = mysql.connection.cursor()
    try:
        cur.execute("SELECT id FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id))
        note = cur.fetchone()
        if not note:
            return jsonify(success=False, errors={'note': 'Note not found or access denied'}), 404

        field_values_json = json.dumps({'Front': front_text, 'Back': back_text})

        cur.execute(
            "UPDATE notes SET field_values = %s WHERE id = %s",
            (field_values_json, note_id)
        )
        mysql.connection.commit()
        
        updated_card_data = {
            'note_id': note_id,
            'front': front_text,
            'back': back_text,
        }
        return jsonify(success=True, message='Note updated successfully', card=updated_card_data)

    except Exception as e:
        mysql.connection.rollback()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
@login_required
def api_delete_note(note_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()
    try:
        cur.execute("SELECT id FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id))
        note = cur.fetchone()
        if not note:
            return jsonify(success=False, errors={'note': 'Note not found or access denied'}), 404

        cur.execute("DELETE FROM notes WHERE id = %s", (note_id,))
        mysql.connection.commit()

        if cur.rowcount > 0:
            return jsonify(success=True, message='Note and associated flashcards deleted successfully')
        else:
            return jsonify(success=False, message='Note could not be deleted or was already deleted'), 400

    except Exception as e:
        mysql.connection.rollback()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()


@app.route('/api/decks/<int:deck_id>/cards', methods=['POST'])
@login_required
def api_add_card_to_deck(deck_id):
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format'}), 400

    front_text = data.get('front', '').strip()
    back_text = data.get('back', '').strip()

    if not front_text or not back_text:
        return jsonify(success=False, errors={'content': 'Front and Back text are required'}), 400

    cur = mysql.connection.cursor()
    try:
        cur.execute("SELECT id FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id))
        deck = cur.fetchone()
        if not deck:
            return jsonify(success=False, errors={'deck': 'Deck not found'}), 404

        default_note_type_id = 1
        cur.execute("SELECT id FROM note_types WHERE id = %s", (default_note_type_id,))
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO note_types (id, name, fields, templates) VALUES (%s, %s, %s, %s)",
                (default_note_type_id, 'Basic', '["Front", "Back"]', 
                '{"Default Card": {"front_template": "{{Front}}", "back_template": "{{Back}}"}}')
            )

        field_values_json = json.dumps({'Front': front_text, 'Back': back_text})

        cur.execute(
            "INSERT INTO notes (user_id, note_type_id, field_values) VALUES (%s, %s, %s)",
            (user_id, default_note_type_id, field_values_json)
        )
        note_id = cur.lastrowid

        cur.execute(
            "INSERT INTO flashcards (note_id, deck_id, card_type, due_date, ease_factor, reps, intervals) "
            "VALUES (%s, %s, 'new', CURDATE(), 2.5, 0, 0)",
            (note_id, deck_id)
        )
        flashcard_id = cur.lastrowid
        mysql.connection.commit()

        cur.execute("SELECT due_date FROM flashcards WHERE id = %s", (flashcard_id,))
        flashcard_info = cur.fetchone()
        due_date_str = (flashcard_info['due_date'].strftime('%Y-%m-%d') 
                        if flashcard_info and flashcard_info.get('due_date') 
                        else datetime.today().strftime('%Y-%m-%d'))

        new_card_data = {
            'note_id': note_id,
            'flashcard_id': flashcard_id,
            'front': front_text,
            'back': back_text,
            'card_type': 'new',
            'due_date': due_date_str
        }
        return jsonify(success=True, message='Card added successfully', card=new_card_data), 201

    except Exception as e:
        mysql.connection.rollback()
        return jsonify(success=False, errors={'general': 'Database error occurred'}), 500
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
    cur = None
    try:
        cur = mysql.connection.cursor()
        cur.execute("""
            SELECT id, username, email, date_of_birth, gender, country, city, created_at
            FROM users
            WHERE id = %s
        """, (user_id,))
        user_data = cur.fetchone()

        if not user_data:
             return jsonify(success=False, errors={'general': 'User not found'}), 404

        cur.execute("""
            SELECT new_cards_per_day, max_reviews_per_day, learning_steps, ease_bonus
            FROM settings
            WHERE user_id = %s
        """, (user_id,))
        settings_data = cur.fetchone()

        if not settings_data:
             settings_data = {
                 'new_cards_per_day': 20,
                 'max_reviews_per_day': 100,
                 'learning_steps': '1,10',
                 'ease_bonus': 1.3
             }

        cur.execute("SELECT points FROM user_stats WHERE user_id = %s", (user_id,))
        user_stats = cur.fetchone()
        current_points = user_stats['points'] if user_stats and user_stats.get('points') is not None else 0

        profile_data = dict(user_data)
        profile_data['settings'] = settings_data
        profile_data['points'] = current_points

        if profile_data.get('date_of_birth') and isinstance(profile_data['date_of_birth'], date):
            profile_data['date_of_birth'] = profile_data['date_of_birth'].strftime('%Y-%m-%d')

        return jsonify(success=True, profile=profile_data)

    except Exception as e:
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        if cur:
            cur.close()


@app.route('/api/profile', methods=['PUT'])
@login_required
def api_update_profile():
    user_id = session['user_id']
    data = request.get_json()

    if not data:
        return jsonify(success=False, errors={'general': 'Invalid request format'}), 400

    username = data.get('username')
    email = data.get('email')
    timezone = data.get('timezone') # Note: timezone is received but not used for DB update in current code
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
            username = username.strip()
            if not username:
                return jsonify(success=False, errors={'username': 'Username cannot be empty'}), 400
            update_fields.append("username = %s")
            update_values.append(username)

        if email is not None:
            email = email.strip()
            if not email:
                return jsonify(success=False, errors={'email': 'Email cannot be empty'}), 400
            
            cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (email, user_id))
            existing_user = cur.fetchone()
            if existing_user:
                return jsonify(success=False, errors={'email': 'Email address already in use'}), 409
            
            update_fields.append("email = %s")
            update_values.append(email)

        if update_fields:
            update_query = "UPDATE users SET " + ", ".join(update_fields) + " WHERE id = %s"
            update_values.append(user_id)
            cur.execute(update_query, tuple(update_values))
            
            if username is not None:
                session['username'] = username
            if email is not None:
                session['email'] = email

        cur.execute("""
            SELECT new_cards_per_day, max_reviews_per_day, learning_steps, ease_bonus
            FROM settings WHERE user_id = %s
        """, (user_id,))
        existing_settings = cur.fetchone()

        settings_to_save = {
            'new_cards_per_day': new_cards_per_day if new_cards_per_day is not None else 
                                (existing_settings['new_cards_per_day'] if existing_settings else 20),
            'max_reviews_per_day': max_reviews_per_day if max_reviews_per_day is not None else 
                                   (existing_settings['max_reviews_per_day'] if existing_settings else 100),
            'learning_steps': learning_steps if learning_steps is not None else 
                             (existing_settings['learning_steps'] if existing_settings else '1,10'),
            'ease_bonus': ease_bonus if ease_bonus is not None else 
                         (existing_settings['ease_bonus'] if existing_settings else 1.3)
        }
        
        try:
            settings_to_save['new_cards_per_day'] = int(settings_to_save['new_cards_per_day'])
            settings_to_save['max_reviews_per_day'] = int(settings_to_save['max_reviews_per_day'])
            settings_to_save['ease_bonus'] = float(settings_to_save['ease_bonus'])
            
            if settings_to_save['new_cards_per_day'] < 0 or settings_to_save['max_reviews_per_day'] < 0:
                return jsonify(success=False, errors={'settings': 'Values cannot be negative'}), 400
                
            if settings_to_save['ease_bonus'] <= 0:
                return jsonify(success=False, errors={'settings': 'Ease bonus must be positive'}), 400
                
        except (ValueError, TypeError):
            return jsonify(success=False, errors={'settings': 'Invalid setting values'}), 400

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
            (user_id, settings_to_save['new_cards_per_day'], settings_to_save['max_reviews_per_day'], 
             settings_to_save['learning_steps'], settings_to_save['ease_bonus'])
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
        if updated_profile_data.get('date_of_birth') and isinstance(updated_profile_data['date_of_birth'], date):
            updated_profile_data['date_of_birth'] = updated_profile_data['date_of_birth'].strftime('%Y-%m-%d')

        return jsonify(success=True, message='Profile updated successfully', profile=updated_profile_data)

    except Exception as e:
        mysql.connection.rollback()
        return jsonify(success=False, errors={'general': 'Database error occurred'}), 500
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
    name = request.form.get('name', '').strip()
    email = request.form.get('email', '').strip()
    password = request.form.get('password', '')
    dob_str = request.form.get('dob', '')
    gender = request.form.get('gender', '')
    country = request.form.get('country', '')
    city = request.form.get('city', '')
    
    dob = None
    if dob_str:
        try:
            dob = datetime.strptime(dob_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'success': False, 'errors': {'dob': 'Invalid date format for Date of Birth. Use YYYY-MM-DD.'}}), 400

    if not name or not email or not password:
        return jsonify({'success': False, 'errors': {'general': 'Required fields are missing'}}), 400
    
    cur = mysql.connection.cursor()
    try:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            return jsonify({'success': False, 'errors': {'email': 'Email already registered'}}), 409
            
        hashedPassword = generate_password_hash(password)
        
        cur.execute(
            """
            INSERT INTO users (username, email, password_hash, date_of_birth, gender, country, city)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (name, email, hashedPassword, dob, gender, country, city)
        )

        mysql.connection.commit()
        return jsonify({'success': True, 'redirect': url_for('auth', tab='login')})
    except Exception as e:
        mysql.connection.rollback()
        return jsonify({'success': False, 'errors': {'general': 'Registration failed'}}), 500
    finally:
        cur.close()


@app.route('/api/login', methods=['POST'])
def login():
    email = request.form.get('email', '').strip()
    password = request.form.get('password', '')
    remember = request.form.get('remember') == 'on'

    if not email or not password:
        return jsonify({'success': False, 'errors': {'general': 'Email and password required'}}), 400

    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        cur.close()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'success': False, 'errors': {'general': 'Invalid credentials'}}), 401

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['email'] = user['email']

        if remember:
            session.permanent = True
            app.permanent_session_lifetime = timedelta(days=30)

        return jsonify({'success': True, 'redirect': url_for('dashboard')})
    except Exception as e:
        return jsonify({'success': False, 'errors': {'general': 'Login failed'}}), 500
    
@app.route('/api/logout')
@login_required
def logout():
    session.clear()
    flash('You have been logged out.', 'success')
    return redirect(url_for('auth', tab='login'))

@app.route('/api/check-auth')
def check_auth():
    if 'user_id' in session:
        return jsonify({
            'authenticated': True,
            'user_id': session['user_id'],
            'username': session.get('username'),
            'email': session.get('email')
        })
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
    tags_str = data.get('tags', []) 
    cards_data = data.get('cards', [])

    if not deck_name or not deck_name.strip():
        return jsonify(success=False, errors={'name': 'Deck name is required'}), 400
    deck_name = deck_name.strip()

    user_id = session['user_id']
    cur = mysql.connection.cursor()
    deck_id = None
    tag_ids_for_notes = []

    try:
        cur.execute(
            "INSERT INTO decks (user_id, name, description) VALUES (%s, %s, %s)",
            (user_id, deck_name, description)
        )
        deck_id = cur.lastrowid
        if not deck_id:
             mysql.connection.rollback()
             return jsonify(success=False, errors={'general': 'Failed to create deck entry.'}), 500


        if tags_str:
            tag_names = [tag.strip() for tag in tags_str if isinstance(tag, str) and tag.strip()]
            for tag_name in tag_names:
                cur.execute("SELECT id FROM tags WHERE name = %s", (tag_name,))
                tag_result = cur.fetchone()
                tag_id = None

                if tag_result:
                    tag_id = tag_result['id']
                else:
                    try:
                        cur.execute("INSERT INTO tags (name) VALUES (%s)", (tag_name,))
                        tag_id = cur.lastrowid
                        if not tag_id:
                             continue
                    except Exception as e_insert:
                         continue

                if tag_id:
                    try:
                         cur.execute(
                            "INSERT INTO deck_tags (deck_id, tag_id) VALUES (%s, %s)",
                            (deck_id, tag_id)
                         )
                    except Exception as e_deck_tag:
                         pass
                    tag_ids_for_notes.append(tag_id)

        default_note_type_id = 1 
        cur.execute("SELECT id FROM note_types WHERE id = %s", (default_note_type_id,))
        if not cur.fetchone():
             cur.execute(
                "INSERT IGNORE INTO note_types (id, name, fields, templates) VALUES (%s, %s, %s, %s)",
                (default_note_type_id, 'Basic', '["Front", "Back"]', '{"Default Card": {"front_template": "{{Front}}", "back_template": "{{Back}}"}}')
            )

        flashcards_created_count = 0
        for card_item in cards_data:
            front_text = card_item.get('front')
            back_text = card_item.get('back')

            if not front_text or not back_text:
                continue 

            field_values_json = json.dumps({'Front': front_text, 'Back': back_text})

            cur.execute(
                "INSERT INTO notes (user_id, note_type_id, field_values) VALUES (%s, %s, %s)",
                (user_id, default_note_type_id, field_values_json)
            )
            note_id = cur.lastrowid
            if not note_id:
                 mysql.connection.rollback()
                 return jsonify(success=False, errors={'general': 'Failed to create note for a card.'}), 500

            if tag_ids_for_notes:
                 note_tag_values = [(note_id, tag_id) for tag_id in tag_ids_for_notes]
                 if note_tag_values:
                     placeholders = ', '.join(['(%s, %s)'] * len(note_tag_values))
                     flat_values = [item for sublist in note_tag_values for item in sublist]
                     try:
                         cur.execute(
                            f"INSERT INTO note_tags (note_id, tag_id) VALUES {placeholders}",
                            tuple(flat_values)
                         )
                     except Exception as e_note_tag:
                         pass

            cur.execute(
                """
                INSERT INTO flashcards (note_id, deck_id, card_type, due_date, ease_factor, reps, intervals)
                VALUES (%s, %s, 'new', CURDATE(), 2.5, 0, 0) 
                """,
                (note_id, deck_id)
            )
            flashcard_id = cur.lastrowid
            if not flashcard_id:
                 mysql.connection.rollback()
                 return jsonify(success=False, errors={'general': 'Failed to create flashcard entry.'}), 500
            flashcards_created_count += 1

        mysql.connection.commit()

        cur.execute("""
            SELECT d.id, d.name, d.description, d.created_at, 
                   (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) as card_count,
                   GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') as tags_on_deck
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.id = %s AND d.user_id = %s
            GROUP BY d.id
        """, (deck_id, user_id)) 
        new_deck_data_row = cur.fetchone()

        if new_deck_data_row:
            new_deck_data = dict(new_deck_data_row)
            new_deck_data['mastered_percentage'] = 0
            new_deck_data['tags'] = new_deck_data.pop('tags_on_deck', None)
        else:
            return jsonify(success=True, message=f'Deck "{deck_name}" created successfully, but failed to fetch details. Deck ID: {deck_id}'), 201

        return jsonify(success=True, message=f'Deck "{deck_name}" and {flashcards_created_count} card(s) created successfully.', deck=new_deck_data), 201

    except Exception as e:
        traceback.print_exc()
        if mysql.connection and hasattr(mysql.connection, 'rollback'):
             mysql.connection.rollback()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        if cur:
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
                (SELECT COUNT(*) 
                    FROM flashcards sf 
                    WHERE sf.deck_id = d.id AND sf.card_type = 'review' AND sf.ease_factor >= 2.8
                ) as mastered_cards_in_deck,
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
            deck_data = dict(deck_row)
            
            card_count = deck_data.get('card_count', 0)
            mastered_count = deck_data.get('mastered_cards_in_deck', 0)

            if card_count > 0:
                deck_data['mastered_percentage'] = round((mastered_count / card_count) * 100, 0)
            else:
                deck_data['mastered_percentage'] = 0
            
            decks_with_progress.append(deck_data)

        return jsonify(success=True, decks=decks_with_progress)

    except Exception as e:
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()
        
@app.route('/api/study/session/<int:deck_id>', methods=['GET'])
@login_required
def api_get_study_cards(deck_id):
    user_id = session['user_id']
    cur = mysql.connection.cursor()

    try:
        cur.execute("SELECT id FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id))
        deck = cur.fetchone()
        if not deck:
            return jsonify(success=False, errors={'deck': 'Deck not found or access denied'}), 404

        cur.execute("""
            SELECT new_cards_per_day, max_reviews_per_day
            FROM settings
            WHERE user_id = %s
        """, (user_id,))
        user_settings = cur.fetchone()

        new_cards_limit = user_settings['new_cards_per_day'] if user_settings and user_settings['new_cards_per_day'] is not None else 20
        review_cards_limit = user_settings['max_reviews_per_day'] if user_settings and user_settings['max_reviews_per_day'] is not None else 100

        today = date.today()

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

        all_cards_raw = list(new_cards) + list(review_cards)

        cards_for_study = []
        for card_raw in all_cards_raw:
            card_data = dict(card_raw)
            field_values = parse_field_values_utility(card_data.get('field_values'))
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

        import random
        random.shuffle(cards_for_study)

        return jsonify(success=True, deck_id=deck_id, cards=cards_for_study)

    except Exception as e:
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
    rating_text_lower = rating_text.lower() if rating_text else None
    
    rating_map = {'hard': 1, 'good': 2, 'easy': 3}
    rating = rating_map.get(rating_text_lower)

    if rating is None:
        return jsonify(success=False, errors={'rating': 'Invalid rating provided. Expected "hard", "good", or "easy".'}), 400

    points_awarded = 0
    if rating == 3: 
        points_awarded = 500
    elif rating == 2:
        points_awarded = 200
    elif rating == 1:
        points_awarded = 50

    cur = None
    try:
        cur = mysql.connection.cursor()
        today = date.today()

        cur.execute("""
            SELECT f.*, n.user_id
            FROM flashcards f
            JOIN notes n ON f.note_id = n.id
            WHERE f.id = %s
        """, (flashcard_id,))
        flashcard = cur.fetchone()

        if not flashcard or flashcard['user_id'] != user_id:
            return jsonify(success=False, errors={'flashcard': 'Flashcard not found or access denied'}), 404

        cur.execute("""
            SELECT learning_steps, ease_bonus
            FROM settings
            WHERE user_id = %s
        """, (user_id,))
        user_settings = cur.fetchone()
        
        default_ease_bonus = 1.3
        ease_bonus = user_settings['ease_bonus'] if user_settings and user_settings.get('ease_bonus') is not None else default_ease_bonus

        current_interval = flashcard['intervals']
        current_ease_factor = flashcard['ease_factor']
        current_reps = flashcard['reps']
        current_lapses = flashcard['lapses']
        current_card_type = flashcard['card_type']
        last_reviewed_dt = datetime.now()

        new_reps = current_reps + 1
        new_lapses = current_lapses
        new_card_type = current_card_type 
        new_ease_factor = current_ease_factor
        new_interval = current_interval

        if rating == 3:
            if current_card_type == 'new':
                new_interval = 4 
            elif current_card_type == 'learning':
                new_interval = 1 
            else:
                new_interval = round(current_interval * current_ease_factor * ease_bonus)
            new_ease_factor = current_ease_factor + 0.15
            new_card_type = 'review'

        elif rating == 2:
            if current_card_type == 'new':
                new_interval = 1 
                new_card_type = 'learning' 
            elif current_card_type == 'learning':
                 new_interval = max(1, round(current_interval * 1.2)) 
                 new_card_type = 'learning' 
            else: 
                new_interval = round(current_interval * current_ease_factor)
            if current_card_type == 'review': new_card_type = 'review'


        elif rating == 1:
            new_lapses += 1
            new_ease_factor = max(1.3, current_ease_factor - 0.20)
            new_interval = 1 
            new_card_type = 'learning' 

        new_ease_factor = max(1.3, min(5.0, new_ease_factor)) 
        final_interval_days = max(1, int(round(new_interval)))
        next_due_date = today + timedelta(days=final_interval_days)

        cur.execute(
            """
            UPDATE flashcards
            SET
                card_type = %s, due_date = %s, intervals = %s, ease_factor = %s,
                reps = %s, lapses = %s, last_reviewed = %s
            WHERE id = %s
            """,
            (new_card_type, next_due_date, final_interval_days, new_ease_factor,
             new_reps, new_lapses, last_reviewed_dt, flashcard_id)
        )

        cur.execute(
            """
            INSERT INTO review_logs (flashcard_id, user_id, rating, review_time, intervals_before, intervals_after, ease_factor_before, ease_factor_after)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (flashcard_id, user_id, rating, last_reviewed_dt, current_interval, final_interval_days, current_ease_factor, new_ease_factor)
        )

        cur.execute(
            """
            INSERT INTO user_stats (user_id, points, total_reviews, last_reviewed_date)
            VALUES (%s, %s, 1, %s)
            ON DUPLICATE KEY UPDATE
                points = points + VALUES(points),
                total_reviews = total_reviews + 1,
                last_reviewed_date = VALUES(last_reviewed_date)
            """,
            (user_id, points_awarded, today) 
        )

        mysql.connection.commit()

        return jsonify(
            success=True,
            message=f'Review recorded. You earned {points_awarded} points!',
            flashcard_id=flashcard_id,
            points_earned=points_awarded,
            new_state={
                'card_type': new_card_type,
                'due_date': next_due_date.strftime('%Y-%m-%d'),
                'intervals': final_interval_days,
                'ease_factor': round(new_ease_factor, 2),
                'reps': new_reps,
                'lapses': new_lapses
            }
        )

    except Exception as e:
        if mysql.connection and hasattr(mysql.connection, 'rollback'):
            mysql.connection.rollback()
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        if cur: 
            cur.close()
            
@app.route('/api/decks/<int:deck_id>', methods=['GET'])
@login_required
def api_get_deck_details(deck_id):
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
            FROM decks d
            LEFT JOIN deck_tags dt ON d.id = dt.deck_id
            LEFT JOIN tags t ON dt.tag_id = t.id
            WHERE d.id = %s AND d.user_id = %s
            GROUP BY d.id 
        """, (deck_id, user_id))
        
        deck = cur.fetchone()
        
        if deck:
            return jsonify(success=True, deck=deck)
        else:
            return jsonify(success=False, errors={'deck': 'Deck not found or access denied'}), 404

    except Exception as e:
        traceback.print_exc()
        return jsonify(success=False, errors={'general': f'An error occurred: {str(e)}'}), 500
    finally:
        cur.close()

if __name__ == '__main__':
    app.run(debug=True)