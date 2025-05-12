from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_mysqldb import MySQL
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import config
from functools import wraps
import json

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

@app.route('/create-deck')
@login_required
def createDeck():
    return render_template('create-deck.html')

@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html')

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

if __name__ == '__main__':
    app.run(debug=True)