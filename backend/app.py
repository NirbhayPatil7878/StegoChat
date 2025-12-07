
from flask import Flask, request, jsonify, send_from_directory
from stego_engine import embed_message, extract_message
import os, random

BASE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(BASE, '..', 'frontend')
SAMPLE = os.path.join(BASE, '..', 'sample_images')
UPLOAD = os.path.join(BASE, '..', 'uploads')
os.makedirs(UPLOAD, exist_ok=True)

app = Flask(__name__, static_folder=FRONT, static_url_path='')

@app.route('/')
def login():
    return send_from_directory(FRONT, 'login.html')

@app.route('/chat')
def chat_page():
    return send_from_directory(FRONT, 'index.html')

@app.route('/uploads/<path:f>')
def uploaded(f):
    return send_from_directory(UPLOAD, f)

@app.route('/sample/<path:f>')
def sample_file(f):
    return send_from_directory(SAMPLE, f)

@app.route('/sample-list')
def sample_list():
    files = [x for x in os.listdir(SAMPLE) if x.lower().endswith(('.png', '.jpg', '.jpeg'))]
    return jsonify(files)

@app.route('/api/embed', methods=['POST'])
def api_embed():
    mode = request.form.get('mode', 'upload')
    msg = request.form.get('message', '')
    pw = request.form.get('password', '')
    if not msg or not pw:
        return jsonify({'error': 'message and password required'}), 400

    if mode == 'upload':
        if 'image' not in request.files or request.files['image'].filename == '':
            return jsonify({'error': 'no image uploaded'}), 400
        f = request.files['image']
        cover = os.path.join(UPLOAD, 'user_' + f.filename)
        f.save(cover)
    else:
        opts = [x for x in os.listdir(SAMPLE) if x.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if not opts:
            return jsonify({'error': 'no sample images found'}), 500
        c = random.choice(opts)
        cover = os.path.join(SAMPLE, c)

    out_name = f"stego_{random.randint(100000, 999999)}.png"
    out_path = os.path.join(UPLOAD, out_name)
    try:
        embed_message(cover, out_path, msg, pw)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    return jsonify({'status': 'ok', 'stego_url': f'/uploads/{out_name}'})

@app.route('/api/extract', methods=['POST'])
def api_extract():
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({'error': 'no image uploaded'}), 400
    pw = request.form.get('password', '')
    if not pw:
        return jsonify({'error': 'password required'}), 400

    f = request.files['image']
    tmp = os.path.join(UPLOAD, 'tmp_' + f.filename)
    f.save(tmp)
    try:
        m = extract_message(tmp, pw)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'status': 'ok', 'message': m})

if __name__ == '__main__':
    app.run(debug=True)
