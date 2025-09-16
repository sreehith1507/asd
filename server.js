const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const exif = require('exif-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
	session({
		secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
		resave: false,
		saveUninitialized: false,
		cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
	})
);

// Simple in-memory users for demo
const users = {
	collector: { username: 'collector', password: 'collector123', role: 'collector' },
	admin: { username: 'admin', password: 'admin123', role: 'admin' }
};

function ensureAuth(req, res, next) {
	if (req.session && req.session.user) return next();
	return res.redirect('/login');
}

function ensureRole(role) {
	return function (req, res, next) {
		if (req.session && req.session.user && req.session.user.role === role) return next();
		return res.status(403).send('Forbidden');
	};
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
	if (req.session.user) return res.redirect('/dashboard');
	res.redirect('/login');
});

app.get('/login', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login-admin', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'login-admin.html'));
});

app.post('/api/login', (req, res) => {
	const { username, password } = req.body;
	const found = users[username];
	if (found && found.password === password) {
		req.session.user = { username: found.username, role: found.role };
		return res.json({ ok: true, role: found.role });
	}
	return res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
	req.session.destroy(() => res.json({ ok: true }));
});

app.get('/dashboard', ensureAuth, (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/session', (req, res) => {
	res.json({ user: req.session.user || null });
});

// Multer storage to temp folder
const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.post('/api/upload-image', ensureAuth, upload.single('image'), (req, res) => {
	try {
		if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });
		const filePath = req.file.path;
		const buffer = fs.readFileSync(filePath);
		let exifData = {};
		try {
			const parser = exif.create(buffer);
			exifData = parser.parse();
		} catch (e) {
			exifData = { error: 'No EXIF or parse error' };
		}

		const info = {
			originalName: req.file.originalname,
			mimeType: req.file.mimetype,
			sizeBytes: req.file.size,
			width: (exifData && exifData.imageSize && exifData.imageSize.width) || null,
			height: (exifData && exifData.imageSize && exifData.imageSize.height) || null,
			gps: exifData && exifData.tags && exifData.tags.GPSLatitude ? {
				lat: exifData.tags.GPSLatitude,
				lon: exifData.tags.GPSLongitude
			} : null,
			capturedAt: exifData && exifData.tags && exifData.tags.CreateDate ? exifData.tags.CreateDate : null
		};

		fs.unlink(filePath, () => {});
		return res.json({ ok: true, info, rawExif: exifData && exifData.tags ? exifData.tags : {} });
	} catch (err) {
		return res.status(500).json({ ok: false, error: 'Upload failed' });
	}
});

app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
}); 