require('dotenv').config();
const config = require('./config').getConfig();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');

const { pool } = require('./db');
const healthRouter = require('./routes/health.routes');
const authRouter = require('./routes/auth.routes');
const userRouter = require('./routes/user.routes');
const bandRouter = require('./routes/band.routes');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const PORT = config.port;
const isProduction = config.isProduction;
const PostgresStore = connectPgSimple(session);

app.set('trust proxy', config.trustProxy);

app.use(helmet());

app.use((req, res, next) => {
  if (!isProduction || req.secure) return next();

  return res.status(426).json({
    error: { code: 'HTTPS_REQUIRED', message: 'HTTPS is required' },
  });
});

app.use(cors({
  origin: config.clientOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(session({
  name: 'bandos.sid',
  secret: config.sessionSecret,
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
app.use('/api/v1/bands', bandRouter);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Bandos API listening on port ${PORT}`);
});
