require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');

const { pool } = require('./db');
const healthRouter = require('./routes/health.routes');
const authRouter = require('./routes/auth.routes');
const userRouter = require('./routes/user.routes');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const PostgresStore = connectPgSimple(session);

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use((req, res, next) => {
  if (!isProduction || req.secure) return next();

  return res.status(426).json({
    error: { code: 'HTTPS_REQUIRED', message: 'HTTPS is required' },
  });
});

app.use(cors({
  origin: process.env.CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json());
app.use(session({
  name: 'bandos.sid',
  secret: process.env.SESSION_SECRET,
  store: new PostgresStore({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Bandos API listening on port ${PORT}`);
});
