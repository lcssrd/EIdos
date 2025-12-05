const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { z } = require('zod');

// Importations pour Socket.io
const http = require('http');
const { Server } = require("socket.io");

// --- CONFIGURATION ---
const app = express();

// [CRITIQUE POUR RENDER] Faire confiance au proxy
app.set('trust proxy', 1);

// Sécurisation des en-têtes HTTP (CORRECTION: CSP Ajustée pour admin onclick)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Requis pour les scripts inline (ex: AOS.init dans index.html)
                "'unsafe-eval'",   // Requis pour le CDN Tailwind CSS
                "https://cdn.tailwindcss.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://cloud.umami.is",
                "https://cdn.socket.io"
            ],
            // AJOUT: Autoriser les attributs onclick="..." utilisés dans l'interface admin
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // Requis pour Tailwind et les styles inline
                "https://cdnjs.cloudflare.com",
                "https://fonts.googleapis.com",
                "https://unpkg.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: ["'self'", "data:", "https://eidos-simul.fr", "blob:"], // blob: ajouté pour URL.createObjectURL
            connectSrc: [
                "'self'",
                "https://cloud.umami.is",
                "https://cloud.umami.is/api/send",
                // Autoriser les connexions WebSocket (WSS) vers le même domaine
                "wss:", 
                "https:" 
            ],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));

// Gestion du proxy (redirection HTTP -> HTTPS)
app.use((req, res, next) => {
    // Sur Render, x-forwarded-proto vaut 'http' ou 'https'
    if (req.headers['x-forwarded-proto'] === 'http') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// Configuration CORS Dynamique (CORRECTION: Support localhost et prévisualisations Render)
app.use(cors({
    origin: (origin, callback) => {
        // Autoriser les requêtes sans origine (ex: curl, postman, applications mobiles)
        if (!origin) return callback(null, true);
        
        // Liste blanche explicite
        const allowedOrigins = [process.env.CLIENT_URL, 'https://eidos-simul.onrender.com'];
        
        // Vérification
        if (allowedOrigins.indexOf(origin) !== -1 || 
            origin.endsWith('.onrender.com') || // Autorise tous les sous-domaines Render (ex: pr-123.onrender.com)
            origin.includes('localhost') ||     // Autorise le développement local
            origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            callback(new Error('Non autorisé par CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// --- RATE LIMITING ---
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de tentatives de connexion, veuillez réessayer dans 15 minutes." }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de requêtes à l'API, veuillez ralentir." }
});

// --- SERVIR LE FRONTEND (FICHIERS STATIQUES) ---
app.use(express.static(path.join(__dirname, 'public')));

// Appliquer les rate limits aux routes API uniquement
app.use('/auth', authLimiter);
app.use('/api', apiLimiter);

// --- SOCKET.IO ---
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    // Configuration CORS Socket.io (Alignée avec Express)
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            const allowedOrigins = [process.env.CLIENT_URL, 'https://eidos-simul.onrender.com'];
            if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.onrender.com') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

// VARIABLES ENV
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// --- NODEMAILER ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// --- SCHÉMAS DE VALIDATION ZOD ---

const loginSchema = z.object({
    identifier: z.string().min(1, "Identifiant requis").max(100),
    password: z.string().min(1, "Mot de passe requis").max(100)
});

const signupSchema = z.object({
    email: z.string().email("Email invalide").max(150),
    password: z.string().min(6, "Le mot de passe doit faire 6 caractères min.").max(100),
    plan: z.enum(['free', 'independant', 'promo', 'centre']).optional(),
    token: z.string().max(200).optional()
});

const verifySchema = z.object({
    email: z.string().email().max(150),
    code: z.string().min(1).max(20)
});

const dossierItemSchema = z.object({
    author: z.string().max(100).optional(),
    text: z.string().max(20000).optional(),
    dateOffset: z.number().optional(),
    date: z.string().max(50).optional()
}).catchall(z.any()); // On garde z.any() ici pour flexibilité interne

const patientSaveSchema = z.object({
    sidebar_patient_name: z.string().min(1, "Nom du patient requis").max(100),
    dossierData: z.object({
        observations: z.array(dossierItemSchema).optional(),
        transmissions: z.array(dossierItemSchema).optional(),
        prescriptions: z.array(z.any()).optional(),
        biologie: z.any().optional(),
        pancarte: z.any().optional(),
        glycemie: z.any().optional(),
        careDiagramRows: z.array(z.object({ name: z.string().max(200) })).optional(),
        careDiagramCheckboxes: z.array(z.boolean()).optional(),
        comptesRendus: z.record(z.string().max(50000)).optional(),
    // Restriction: On accepte strings, nombres, booléens ou null, mais pas d'objets complexes arbitraires profonds
    }).catchall(z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.any()), z.record(z.any())]))
});

// Admin update user schema
const adminUserUpdateSchema = z.object({
    plan: z.enum(['free', 'independant', 'promo', 'centre', 'student']).optional(),
    email: z.string().email().optional(),
    isSuspended: z.boolean().optional()
});

// Broadcast schema
const broadcastSchema = z.object({
    message: z.string().min(1).max(500)
});

// Middleware de validation générique
const validate = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (err) {
        return res.status(400).json({
            error: "Données invalides",
            details: err.errors.map(e => e.message).join(', ')
        });
    }
};

// Helper pour gestion d'erreur sécurisée
const safeError = (res, err, status = 500) => {
    console.error(err);
    const message = process.env.NODE_ENV === 'production'
        ? "Une erreur interne est survenue."
        : err.message;
    if (!res.headersSent) res.status(status).json({ error: message });
};

// --- HELPER COOKIE ---
const sendTokenResponse = (user, statusCode, res) => {
    // Session réduite à 12h
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });

    const options = {
        expires: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 heures
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax',
    };

    res.status(statusCode)
        .cookie('jwt', token, options)
        .json({ success: true, role: user.role });
};

// --- MODÈLES ---

// Modèle pour les Logs Système (ADMIN TECHNIQUE)
const systemLogSchema = new mongoose.Schema({
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
}, { capped: { size: 1024 * 1024, max: 1000 } });
const SystemLog = mongoose.model('SystemLog', systemLogSchema);

// Modèle Configuration Globale (Maintenance)
const globalConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed }
});
const GlobalConfig = mongoose.model('GlobalConfig', globalConfigSchema);

// Override console.error pour capturer les erreurs dans Mongo
const originalConsoleError = console.error;
console.error = function (...args) {
    try {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        new SystemLog({ level: 'error', message: msg }).save().catch(() => {});
    } catch (e) {}
    originalConsoleError.apply(console, args);
};

const organisationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: String, default: 'centre', enum: ['centre'] },
    licences_max: { type: Number, default: 50 },
    quote_url: { type: String, default: null },
    quote_price: { type: String, default: null },
    is_active: { type: Boolean, default: false }
});
const Organisation = mongoose.model('Organisation', organisationSchema);

const invitationSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, index: true },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    token: { type: String, required: true, unique: true },
    expires_at: { type: Date, default: () => Date.now() + 7 * 24 * 60 * 60 * 1000 }
});
const Invitation = mongoose.model('Invitation', invitationSchema);

const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, lowercase: true, sparse: true },
    login: { type: String, unique: true, lowercase: true, sparse: true },
    passwordHash: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    confirmationCode: { type: String },
    is_super_admin: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'formateur', 'owner', 'etudiant'], required: true },
    subscription: { type: String, default: 'free' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', default: null },
    is_owner: { type: Boolean, default: false },
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    allowedRooms: { type: [String], default: [] },
    newEmail: { type: String, lowercase: true, default: null },
    newEmailToken: { type: String, default: null },
    newEmailTokenExpires: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    isSuspended: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const patientSchema = new mongoose.Schema({
    patientId: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sidebar_patient_name: { type: String, default: '' },
    dossierData: { type: mongoose.Schema.Types.Mixed, default: {} },
    isPublic: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
patientSchema.index({ patientId: 1, user: 1 }, { unique: true });
patientSchema.pre('save', function(next) { this.updatedAt = Date.now(); next(); }); // Update timestamp
const Patient = mongoose.model('Patient', patientSchema);

// --- MIDDLEWARES ---

// Middleware Maintenance Mode
const checkMaintenance = async (req, res, next) => {
    try {
        const maintenanceConfig = await GlobalConfig.findOne({ key: 'maintenance_mode' });

        if (maintenanceConfig && maintenanceConfig.value === true) {

            // 1. Toujours autoriser les routes API Admin et Auth
            if (req.path.startsWith('/api/admin') || req.path.startsWith('/auth')) {
                return next();
            }

            // 2. Exception : Laisser passer les Super Admins
            const token = req.cookies.jwt;
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    const user = await User.findById(decoded.id);
                    if (user && user.is_super_admin) {
                        return next();
                    }
                } catch (err) {}
            }

            return res.status(503).json({ error: "Maintenance en cours. Réessayez plus tard." });
        }
        next();
    } catch(e) { next(); }
};
app.use(checkMaintenance);

// Lecture du Cookie HttpOnly + Vérification Suspension
const protect = async (req, res, next) => {
    let token;

    if (req.cookies && req.cookies.jwt) {
        token = req.cookies.jwt;
    }
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ error: 'Non autorisé (pas de token)' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).populate('organisation');
        if (!user) {
            return res.status(401).json({ error: 'Utilisateur non trouvé' });
        }

        if (user.isSuspended) {
            return res.status(403).json({ error: "Votre compte a été suspendu. Contactez le support." });
        }

        if (user.role === 'user' && (user.subscription === 'independant' || user.subscription === 'promo')) {
            user.role = 'formateur';
            await user.save();
        }

        req.user = user;
        if (user.role === 'etudiant') {
            req.user.resourceId = user.createdBy;
        } else {
            req.user.resourceId = user._id;
        }

        if ((user.role === 'formateur' || user.role === 'owner') && user.organisation && user.organisation.is_active) {
            req.user.effectivePlan = user.organisation.plan;
        } else if (user.role === 'etudiant') {
            req.user.effectivePlan = 'student';
        } else {
            req.user.effectivePlan = user.subscription;
        }
        next();
    } catch (err) {
        res.status(401).json({ error: 'Non autorisé (token invalide)' });
    }
};

const checkAdmin = (req, res, next) => {
    if (req.user && req.user.is_super_admin === true) {
        next();
    } else {
        res.status(403).json({ error: 'Accès refusé. Réservé au Super Administrateur.' });
    }
};

// --- SOCKET.IO AVEC COOKIES ---
io.use(async (socket, next) => {
    try {
        const cookieString = socket.handshake.headers.cookie;
        let token = null;

        if (cookieString) {
            const cookies = cookieString.split(';').reduce((acc, cookie) => {
                const [name, value] = cookie.split('=').map(c => c.trim());
                acc[name] = value;
                return acc;
            }, {});
            token = cookies['jwt'];
        }

        if (!token) return next(new Error('Authentification échouée'));

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).populate('organisation');
        if (!user) return next(new Error('Utilisateur non trouvé'));
        if (user.isSuspended) return next(new Error('Compte suspendu'));

        let resourceId;
        if (user.role === 'etudiant') {
            resourceId = user.createdBy;
        } else {
            resourceId = user._id;
        }
        socket.user = user;
        socket.resourceId = resourceId;
        next();
    } catch (err) {
        return next(new Error('Authentification échouée'));
    }
});

// Helper pour diffuser la liste des utilisateurs connectés dans une "room" (classe)
const broadcastRoomUsers = async (roomName) => {
    try {
        const sockets = await io.in(roomName).fetchSockets();
        // On filtre pour ne récupérer que les étudiants
        const students = sockets
            .filter(s => s.user && s.user.role === 'etudiant')
            .map(s => ({ 
                login: s.user.login, 
                id: s.user._id.toString() 
            }));
        
        // On enlève les doublons (si un étudiant a plusieurs onglets ouverts)
        const uniqueStudents = Array.from(new Map(students.map(item => [item.login, item])).values());

        // On envoie la liste mise à jour à tout le monde dans la room
        // (Le filtrage pour que seul le formateur le voie se fera côté client)
        io.to(roomName).emit('room_users_update', uniqueStudents);
    } catch (e) {
        console.error("Erreur broadcast users:", e);
    }
};

io.on('connection', async (socket) => {
    const roomName = `room_${socket.resourceId}`;
    socket.join(roomName);
    socket.join('global_broadcast');
    
    // Mettre à jour la liste quand quelqu'un arrive
    await broadcastRoomUsers(roomName);

    socket.on('disconnect', async () => {
        // Mettre à jour la liste quand quelqu'un part
        await broadcastRoomUsers(roomName);
    });
});

// --- ROUTES API ---

app.post('/auth/login', validate(loginSchema), async (req, res) => {
    try {
        const { identifier, password } = req.body;
        let user;
        const anID = identifier.toLowerCase();
        if (anID.includes('@')) user = await User.findOne({ email: anID });
        else user = await User.findOne({ login: anID });

        if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Identifiants invalides' });
        if ((user.role === 'user' || user.role === 'owner' || user.role === 'formateur') && !user.isVerified) return res.status(401).json({ error: 'Compte non vérifié' });
        if (user.isSuspended) return res.status(403).json({ error: "Compte suspendu par l'administrateur." });

        user.lastLogin = new Date();
        await user.save();

        sendTokenResponse(user, 200, res);
    } catch (e) { safeError(res, e); }
});

app.post('/auth/signup', validate(signupSchema), async (req, res) => {
    try {
        const { email, password, plan, token } = req.body;
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        const passwordHash = await bcrypt.hash(password, 10);

        const confirmationCode = crypto.randomInt(100000, 1000000).toString();

        if (token) {
            const invitation = await Invitation.findOne({ token: token, email: email.toLowerCase() }).populate('organisation');
            if (!invitation || invitation.expires_at < Date.now()) return res.status(400).json({ error: "Invitation invalide ou expirée" });
            const formateurCount = await User.countDocuments({ organisation: invitation.organisation._id, role: 'formateur' });
            if (formateurCount >= invitation.organisation.licences_max) return res.status(403).json({ error: "Nombre maximum de formateurs atteint pour ce centre" });

            const newUser = new User({ email: email.toLowerCase(), passwordHash, isVerified: true, role: 'formateur', subscription: 'promo', organisation: invitation.organisation._id, is_owner: false, lastLogin: new Date() });
            await newUser.save();
            await Invitation.deleteOne({ _id: invitation._id });
            return res.status(201).json({ success: true, verified: true });
        } else {
            let newUser;
            let finalSubscription = plan || 'free';

            if (finalSubscription === 'centre') {
                newUser = new User({ email: email.toLowerCase(), passwordHash, confirmationCode, role: 'owner', subscription: 'free', is_owner: true });
                await newUser.save();
                const newOrg = new Organisation({ name: `Centre de ${email}`, owner: newUser._id, quote_url: "https://stripe.com", quote_price: "Devis", is_active: false });
                await newOrg.save();
                newUser.organisation = newOrg._id;
                await newUser.save();
            } else {
                let role = 'user';
                if (finalSubscription === 'independant' || finalSubscription === 'promo') {
                    role = 'formateur';
                }
                newUser = new User({ email: email.toLowerCase(), passwordHash, confirmationCode, role: role, subscription: finalSubscription });
                await newUser.save();
            }
            try {
                await transporter.sendMail({ from: `"EIdos-simul" <${process.env.EMAIL_FROM}>`, to: email, subject: 'Vérification EIdos-simul', html: `Votre code de vérification : <b>${confirmationCode}</b>` });
            } catch (e) { console.error("Erreur envoi mail:", e); }
            return res.status(201).json({ success: true, verified: false });
        }
    } catch (err) { safeError(res, err); }
});

app.post('/auth/verify', validate(verifySchema), async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || user.confirmationCode !== code) return res.status(400).json({ error: 'Code incorrect' });

        user.isVerified = true;
        user.confirmationCode = undefined;
        user.lastLogin = new Date();
        await user.save();

        sendTokenResponse(user, 200, res);
    } catch (e) { safeError(res, e); }
});

app.post('/auth/resend-code', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const confirmationCode = crypto.randomInt(100000, 1000000).toString();

        user.confirmationCode = confirmationCode;
        await user.save();
        await transporter.sendMail({ from: `"EIdos-simul" <${process.env.EMAIL_FROM}>`, to: email, subject: 'Nouveau code', html: `Code: <b>${confirmationCode}</b>` });
        res.json({ success: true });
    } catch (e) { safeError(res, e); }
});

app.post('/auth/logout', (req, res) => {
    res.cookie('jwt', 'loggedout', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax',
    });
    res.status(200).json({ success: true });
});

app.post('/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.json({ success: true });
        }

        const code = crypto.randomInt(100000, 1000000).toString();
        user.resetPasswordToken = code;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        await transporter.sendMail({
            from: `"EIdos-simul" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: 'Réinitialisation de mot de passe',
            html: `<p>Voici votre code de réinitialisation : <b>${code}</b></p><p>Ce code expire dans 1 heure.</p>`
        });

        res.json({ success: true });
    } catch (e) { safeError(res, e); }
});

app.post('/auth/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        const user = await User.findOne({
            email: email.toLowerCase(),
            resetPasswordToken: code,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: "Code invalide ou expiré" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: "Le mot de passe est trop court." });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ success: true });
    } catch (e) { safeError(res, e); }
});

// --- ROUTES SUPER ADMIN AVANCÉES ---

app.get('/api/admin/stats', protect, checkAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalFormateurs = await User.countDocuments({ role: 'formateur' });
        const totalStudents = await User.countDocuments({ role: 'etudiant' });
        const totalPatients = await Patient.countDocuments();
        const savedPatients = await Patient.countDocuments({ patientId: { $regex: /^save_/ } });

        const lastUsers = await User.find({}).sort({ createdAt: -1 }).limit(5).select('email role createdAt subscription');
        const lastLogins = await User.find({ lastLogin: { $exists: true } }).sort({ lastLogin: -1 }).limit(5).select('email role lastLogin');

        res.json({
            kpis: { totalUsers, totalFormateurs, totalStudents, totalPatients, savedPatients },
            recentActivity: { lastUsers, lastLogins },
            system: {
                memory: process.memoryUsage(),
                uptime: process.uptime()
            }
        });
    } catch (e) { safeError(res, e); }
});

app.get('/api/admin/search', protect, checkAdmin, async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 3) return res.json([]);

        const regex = new RegExp(query, 'i');
        const users = await User.find({
            $or: [{ email: regex }, { login: regex }]
        }).select('email login role subscription isSuspended lastLogin').limit(20);

        res.json(users);
    } catch (e) { safeError(res, e); }
});

app.post('/api/admin/impersonate/:userId', protect, checkAdmin, async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.userId);
        if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });
        if (targetUser.is_super_admin) return res.status(403).json({ error: "Impossible d'impersonate un autre super admin" });

        sendTokenResponse(targetUser, 200, res);
    } catch (e) { safeError(res, e); }
});

app.put('/api/admin/user/:userId', protect, checkAdmin, validate(adminUserUpdateSchema), async (req, res) => {
    try {
        const { plan, email, isSuspended } = req.body;
        const targetUser = await User.findById(req.params.userId);
        if (!targetUser) return res.status(404).json({ error: "Non trouvé" });

        if (plan) targetUser.subscription = plan;
        if (email) targetUser.email = email.toLowerCase();
        if (typeof isSuspended === 'boolean') targetUser.isSuspended = isSuspended;

        await targetUser.save();
        res.json({ success: true, user: targetUser });
    } catch (e) { safeError(res, e); }
});

app.get('/api/admin/logs', protect, checkAdmin, async (req, res) => {
    try {
        const logs = await SystemLog.find().sort({ timestamp: -1 }).limit(100);
        const maintenance = await GlobalConfig.findOne({ key: 'maintenance_mode' });
        res.json({ logs, maintenanceMode: maintenance ? maintenance.value : false });
    } catch (e) { safeError(res, e); }
});

app.post('/api/admin/maintenance', protect, checkAdmin, async (req, res) => {
    try {
        const { active } = req.body;
        await GlobalConfig.findOneAndUpdate({ key: 'maintenance_mode' }, { value: active }, { upsert: true });
        io.emit('maintenance_update', { active });
        res.json({ success: true, active });
    } catch (e) { safeError(res, e); }
});

app.post('/api/admin/broadcast', protect, checkAdmin, validate(broadcastSchema), async (req, res) => {
    try {
        const { message } = req.body;
        io.emit('system_broadcast', { message, date: new Date() });
        res.json({ success: true });
    } catch (e) { safeError(res, e); }
});

app.post('/api/admin/email', protect, checkAdmin, async (req, res) => {
    try {
        const { to, subject, html } = req.body;
        let recipients = [];

        if (to === 'all') {
            const users = await User.find({ email: { $exists: true } }).select('email');
            recipients = users.map(u => u.email);
        } else if (to === 'formateurs') {
            const users = await User.find({ role: { $in: ['formateur', 'owner'] }, email: { $exists: true } }).select('email');
            recipients = users.map(u => u.email);
        } else {
            recipients = [to];
        }

        for (const email of recipients) {
            await transporter.sendMail({ from: `"EIdos Admin" <${process.env.EMAIL_FROM}>`, to: email, subject, html });
        }

        res.json({ success: true, count: recipients.length });
    } catch (e) { safeError(res, e); }
});

app.post('/api/admin/quotes', protect, checkAdmin, async (req, res) => {
    try {
        const { clientEmail, amount, details } = req.body;
        const html = `
            <h1>Devis EIdos-simul</h1>
            <p>Bonjour,</p>
            <p>Voici la proposition pour votre abonnement Centre.</p>
            <p><strong>Montant :</strong> ${amount} €</p>
            <p><strong>Détails :</strong> ${details}</p>
            <p>Pour accepter, répondez à cet email.</p>
        `;
        await transporter.sendMail({ from: `"EIdos Commercial" <${process.env.EMAIL_FROM}>`, to: clientEmail, cc: process.env.EMAIL_FROM, subject: 'Votre Devis EIdos', html });
        res.json({ success: true });
    } catch(e) { safeError(res, e); }
});

// --- ROUTE DOWNGRADE (NOUVEAU) ---
app.post('/api/account/downgrade', protect, async (req, res) => {
    try {
        if (req.user.role === 'etudiant') {
            return res.status(403).json({ error: "Action non autorisée pour les étudiants." });
        }
        req.user.subscription = 'free';
        if (req.user.role === 'formateur') {
            req.user.role = 'user';
        }
        // TODO: Stripe cancellation logic here
        await req.user.save();
        res.json({ success: true, message: "Abonnement résilié. Vous êtes maintenant en version gratuite." });
    } catch (e) { safeError(res, e); }
});

// --- ROUTES STANDARDS ---

app.get('/api/admin/structure', protect, checkAdmin, async (req, res) => {
    const orgsDocs = await Organisation.find({}, 'name plan licences_max owner');
    const organisations = await Promise.all(orgsDocs.map(async (org) => {
        const count = await User.countDocuments({ organisation: org._id, role: 'formateur' });
        return {
            ...org.toObject(),
            licences_utilisees: count + 1
        };
    }));
    const independants = await User.find({ role: { $in: ['user', 'formateur'] }, organisation: null, is_owner: false, role: { $ne: 'etudiant' } }, 'email subscription isVerified isSuspended');
    res.json({ organisations, independants });
});

app.get('/api/admin/centre/:orgId/formateurs', protect, checkAdmin, async (req, res) => {
    const formateurs = await User.find({ organisation: req.params.orgId }, 'email role is_owner subscription isSuspended');
    res.json(formateurs);
});

app.get('/api/admin/creator/:userId/students', protect, checkAdmin, async (req, res) => {
    try {
        const students = await User.find({ createdBy: req.params.userId }, 'login email role isSuspended');
        res.json(students);
    } catch (e) { safeError(res, e); }
});

app.get('/api/admin/patients', protect, checkAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const total = await Patient.countDocuments({ patientId: { $regex: /^save_/ } });
        const patients = await Patient.find({ patientId: { $regex: /^save_/ } })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('user', 'email login')
            .select('patientId sidebar_patient_name isPublic user updatedAt');

        res.json({ patients, total, page, totalPages: Math.ceil(total / limit) });
    } catch(e) { safeError(res, e); }
});

app.get('/api/auth/me', protect, async (req, res) => {
    res.json({ ...req.user.toObject(), effectivePlan: req.user.effectivePlan });
});

app.get('/api/account/details', protect, async (req, res) => {
    if (req.user.role === 'etudiant') return res.status(403).json({ error: 'Non autorisé' });
    const students = await User.find({ createdBy: req.user.resourceId }, 'login permissions allowedRooms');
    let organisationData = null;

    if (req.user.organisation) {
        if (req.user.is_owner) {
            const formateurs = await User.find({ organisation: req.user.organisation._id, is_owner: false }, 'email');
            const invitations = await Invitation.find({ organisation: req.user.organisation._id });
            organisationData = { ...req.user.organisation.toObject(), formateurs, invitations, licences_utilisees: formateurs.length + 1 };
        } else {
            organisationData = {
                name: req.user.organisation.name,
                plan: req.user.organisation.plan
            };
        }
    }

    res.json({ email: req.user.email, plan: req.user.effectivePlan, role: req.user.role, is_owner: req.user.is_owner, is_super_admin: req.user.is_super_admin, students, organisation: organisationData });
});

app.post('/api/account/change-password', protect, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!await bcrypt.compare(currentPassword, req.user.passwordHash)) return res.status(400).json({ error: 'Mot de passe incorrect' });
    req.user.passwordHash = await bcrypt.hash(newPassword, 10); await req.user.save();
    res.json({ success: true });
});

app.delete('/api/account/delete', protect, async (req, res) => {
    await Patient.deleteMany({ user: req.user.resourceId });
    await User.deleteMany({ createdBy: req.user._id });
    if (req.user.is_owner && req.user.organisation) {
        await User.updateMany({ organisation: req.user.organisation._id }, { $set: { organisation: null, role: 'user', subscription: 'free' } });
        await Organisation.deleteOne({ _id: req.user.organisation._id });
    }
    await User.deleteOne({ _id: req.user._id });
    res.cookie('jwt', 'loggedout', { expires: new Date(Date.now() + 10 * 1000), httpOnly: true });
    res.json({ success: true });
});

app.post('/api/account/invite', protect, async (req, res) => {
    const { login, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = new User({ login: login.toLowerCase(), passwordHash, role: 'etudiant', subscription: 'free', createdBy: req.user.resourceId, isVerified: true, permissions: {}, allowedRooms: [], lastLogin: null });
    await newUser.save();
    res.status(201).json({ success: true });
});

app.put('/api/account/permissions', protect, async (req, res) => {
    const { login, permission, value } = req.body;
    await User.updateOne({ login: login.toLowerCase(), createdBy: req.user.resourceId }, { [`permissions.${permission}`]: value });
    res.json({ success: true });
});

app.put('/api/account/student/rooms', protect, async (req, res) => {
    const { login, rooms } = req.body;
    await User.updateOne({ login: login.toLowerCase(), createdBy: req.user.resourceId }, { allowedRooms: rooms });
    res.json({ success: true });
});

app.delete('/api/account/student', protect, async (req, res) => {
    await User.deleteOne({ login: req.body.login.toLowerCase(), createdBy: req.user.resourceId });
    res.json({ success: true });
});

app.post('/api/organisation/invite', protect, async (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const email = req.body.email.toLowerCase();
        await new Invitation({ email: email, organisation: req.user.organisation._id, token }).save();
        const baseUrl = 'https://eidos-simul.onrender.com'; // Modifiez avec votre domaine Render
        const inviteLink = `${baseUrl}/auth.html?invitation_token=${token}&email=${email}`;
        await transporter.sendMail({ from: `"EIdos-simul" <${process.env.EMAIL_FROM}>`, to: email, subject: 'Invitation à rejoindre EIdos-simul', html: `<a href="${inviteLink}">Accepter l'invitation</a>` });
        res.json({ success: true });
    } catch (err) { safeError(res, err); }
});

app.delete('/api/organisation/invite/:id', protect, async (req, res) => {
    if (!req.user.is_owner || !req.user.organisation) return res.status(403).json({ error: 'Non autorisé' });
    try {
        await Invitation.deleteOne({ _id: req.params.id, organisation: req.user.organisation._id });
        res.json({ success: true });
    } catch (err) { safeError(res, err); }
});

app.post('/api/organisation/remove', protect, async (req, res) => {
    await User.updateOne({ email: req.body.email.toLowerCase(), organisation: req.user.organisation._id }, { organisation: null, role: 'user', subscription: 'free' });
    res.json({ success: true });
});

app.delete('/api/admin/user/:userId', protect, checkAdmin, async (req, res) => {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) return res.status(404).json({ error: "Non trouvé" });
    if (targetUser.is_owner && targetUser.organisation) {
        await Organisation.deleteOne({ _id: targetUser.organisation });
        await User.updateMany({ organisation: targetUser.organisation }, { organisation: null, role: 'user', subscription: 'free' });
    }
    await Patient.deleteMany({ user: targetUser._id });
    await User.deleteMany({ createdBy: targetUser._id });
    await User.deleteOne({ _id: targetUser._id });
    res.json({ success: true });
});

app.delete('/api/admin/patients/:id', protect, checkAdmin, async (req, res) => {
    await Patient.deleteOne({ patientId: req.params.id });
    res.json({ success: true });
});

app.put('/api/admin/patients/:id/public', protect, checkAdmin, async (req, res) => {
    try {
        const patient = await Patient.findOne({ patientId: req.params.id });
        if (!patient) return res.status(404).json({ error: "Dossier introuvable" });
        patient.isPublic = !patient.isPublic;
        await patient.save();
        res.json({ success: true, isPublic: patient.isPublic });
    } catch (e) { safeError(res, e); }
});

app.get('/api/patients', protect, async (req, res) => {
    try {
        const baseQuery = { user: req.user.resourceId };
        if (req.user.role === 'etudiant') baseQuery.patientId = { $in: req.user.allowedRooms };
        const publicQuery = { isPublic: true, patientId: { $regex: /^save_/ } };
        const patients = await Patient.find({ $or: [baseQuery, publicQuery] }, 'patientId sidebar_patient_name isPublic user').populate('user', 'email');
        res.json(patients);
    } catch (err) { safeError(res, err); }
});

app.post('/api/patients/save', protect, validate(patientSaveSchema), async (req, res) => {
    if (req.user.role === 'etudiant' || req.user.role === 'user') return res.status(403).json({ error: 'Non autorisé' });
    try {
        const { dossierData, sidebar_patient_name } = req.body;

        const publicCollision = await Patient.findOne({
            sidebar_patient_name: { $regex: new RegExp(`^${sidebar_patient_name}$`, 'i') },
            isPublic: true
        });

        if (publicCollision) {
            return res.status(403).json({
                error: "Dossier public protégé. Enregistrez sous un autre nom."
            });
        }

        const existingSave = await Patient.findOne({ user: req.user.resourceId, sidebar_patient_name: sidebar_patient_name, patientId: { $regex: /^save_/ } });

        if (existingSave) {
            await Patient.updateOne({ _id: existingSave._id }, { dossierData: dossierData });
            res.json({ success: true, message: 'Mise à jour OK.' });
        } else {
            const plan = req.user.effectivePlan;
            if (plan === 'independant' || plan === 'promo') {
                const saveCount = await Patient.countDocuments({ user: req.user.resourceId, patientId: { $regex: /^save_/ }, isPublic: false });
                let limit = (plan === 'independant') ? 20 : 50;
                if (saveCount >= limit) return res.status(403).json({ error: `Limite atteinte (${limit}).` });
            }
            const newPatientId = `save_${new mongoose.Types.ObjectId()}`;
            const newPatient = new Patient({ patientId: newPatientId, user: req.user.resourceId, dossierData: dossierData, sidebar_patient_name: sidebar_patient_name, isPublic: false });
            await newPatient.save();
            res.status(201).json({ success: true, message: 'Sauvegardé.' });
        }
    } catch (err) { safeError(res, err); }
});

app.delete('/api/patients/:patientId', protect, async (req, res) => {
    if (req.user.role === 'etudiant' || req.user.role === 'user') return res.status(403).json({ error: 'Non autorisé' });
    try {
        const patientId = req.params.patientId;
        if (patientId.startsWith('chambre_')) {
            await Patient.findOneAndUpdate({ patientId: patientId, user: req.user.resourceId }, { dossierData: {}, sidebar_patient_name: `Chambre ${patientId.split('_')[1]}` }, { upsert: true });
            try { io.to(`room_${req.user.resourceId}`).emit('patient_updated', { patientId, dossierData: {} }); } catch (e) { }
            res.json({ success: true });
        } else if (patientId.startsWith('save_')) {
            const patient = await Patient.findOne({ patientId: patientId });
            if (!patient) return res.status(404).json({ error: "Introuvable" });
            if (patient.isPublic && req.user.is_super_admin !== true) return res.status(403).json({ error: "Impossible de supprimer un dossier Public." });
            if (patient.user.toString() !== req.user.resourceId.toString() && req.user.is_super_admin !== true) return res.status(403).json({ error: "Non autorisé" });
            await Patient.deleteOne({ _id: patient._id });
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'ID invalide' });
        }
    } catch (err) { safeError(res, err); }
});

app.get('/api/patients/:patientId', protect, async (req, res) => {
    try {
        const patientId = req.params.patientId;
        const userId = req.user.resourceId;
        let patient = await Patient.findOne({ patientId: patientId, user: userId });
        if (!patient && patientId.startsWith('save_')) {
            patient = await Patient.findOne({ patientId: patientId, isPublic: true });
        }
        if (patient) {
            const belongsToUser = (patient.user.toString() === userId.toString());
            if (!belongsToUser && !patient.isPublic && req.user.is_super_admin !== true) return res.status(403).json({ error: 'Accès refusé' });
        }
        if (!patient && patientId.startsWith('chambre_')) {
            patient = new Patient({ patientId: patientId, user: userId, sidebar_patient_name: `Chambre ${patientId.split('_')[1]}` });
            await patient.save();
        } else if (!patient) {
            return res.status(404).json({ error: 'Dossier non trouvé' });
        }
        res.json(patient.dossierData || {});
    } catch (e) { safeError(res, e); }
});

app.post('/api/patients/:patientId', protect, validate(patientSaveSchema), async (req, res) => {
    try {
        if (!req.params.patientId.startsWith('chambre_')) return res.status(400).json({ error: 'Chambres uniquement' });
        if (req.user.role === 'user') return res.status(403).json({ error: "Interdit pour le plan gratuit." });

        const { dossierData, sidebar_patient_name } = req.body;
        const userIdToSave = req.user.resourceId;
        let finalDossierData = dossierData;
        let sidebarUpdate = {};

        if (req.user.role === 'etudiant') {
            const permissions = req.user.permissions;
            finalDossierData = dossierData;
            if (permissions.header) { sidebarUpdate = { sidebar_patient_name }; }
        } else {
            sidebarUpdate = { sidebar_patient_name };
        }

        await Patient.findOneAndUpdate({ patientId: req.params.patientId, user: userIdToSave }, { dossierData: finalDossierData, ...sidebarUpdate, user: userIdToSave }, { upsert: true, new: true });

        try {
            const sId = req.headers['x-socket-id'];
            const room = `room_${userIdToSave}`;
            const socks = await io.in(room).fetchSockets();
            const sender = socks.find(s => s.id === sId);
            if (sender) sender.to(room).emit('patient_updated', { patientId: req.params.patientId, dossierData: finalDossierData, sender: sId });
            else io.to(room).emit('patient_updated', { patientId: req.params.patientId, dossierData: finalDossierData, sender: sId });
        } catch (e) { }
        res.json({ success: true });
    } catch (e) { safeError(res, e); }
});

// Stubs pour webhook paiement
app.post('/api/webhook/payment-received', express.raw({ type: 'application/json' }), async (req, res) => { res.json({ received: true }); });

// Placeholder pour création de session de paiement
app.post('/api/payments/create-checkout-session', protect, async (req, res) => {
    res.status(501).json({ error: "Paiement non encore implémenté" });
});

// Route "Catch-All" pour le SPA (Single Page Application)
// Si une requête arrive ici et qu'elle n'a pas été traitée par /api ou /auth ou les fichiers statiques,
// on renvoie index.html (pour la navigation côté client si vous en aviez, sinon ça redirige vers l'accueil)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

mongoose.connect(MONGO_URI).then(() => { console.log('✅ MongoDB Connecté'); httpServer.listen(PORT, () => console.log(`🚀 Serveur sur port ${PORT}`)); }).catch(e => console.error(e));