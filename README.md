# ExpenseIQ - Expense Tracker

A modern, full-stack expense tracking application built with React, TypeScript, and Node.js. Track expenses, manage budgets, set recurring payments, and gain insights into your spending habits with AI-powered recommendations.

## ✨ Features

- **User Authentication**: Secure login and registration with JWT tokens
- **Expense Management**: Add, edit, and delete expenses with categories and notes
- **Recurring Expenses**: Set up recurring payments that automatically track each month
- **Multi-Currency Support**: Track expenses in different currencies with real-time conversion
- **Budget Management**: Set budgets for categories and track spending against them
- **Monthly & Yearly Trends**: Visual charts and insights into spending patterns
- **Subscription Drift Detector**: Monitor unexpected subscription charges and alerts
- **Money Coach AI**: AI-powered spending narratives and personalized advice
- **Monthly Memo**: AI-generated monthly spending summary and recommendations
- **Data Export**: Export transaction data as CSV for analysis
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark Mode Support**: Eye-friendly interface with Tailwind CSS

## 🛠️ Tech Stack

### Frontend
- **React 19** with TypeScript for type-safe development
- **Vite** for lightning-fast development and optimized builds
- **Tailwind CSS 4** for responsive, utility-first styling
- **Recharts** for interactive data visualization
- **Lucide React** for consistent iconography
- **Dexie** for client-side database operations

### Backend
- **Node.js** with Express.js web framework
- **SQLite** with better-sqlite3 for reliable data persistence
- **JWT** for secure authentication
- **Bcryptjs** for password hashing and security
- **Nodemailer** for email notifications and password resets
- **express-rate-limit** for API rate limiting
- **Helmet** for HTTP security headers
- **CORS** for cross-origin request handling

## 📋 Prerequisites

- **Node.js** >= 20.19.0
- **npm** (comes with Node.js)

## 🚀 Getting Started

### Quick Start (Recommended)
```bash
bash start.sh
```

This automatically installs dependencies and starts both servers.

### Manual Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Start Development Servers**
```bash
npm run dev
```

This starts:
- **Frontend**: http://localhost:5173 (React + Vite with hot reload)
- **Backend API**: http://localhost:3001 (Node.js + Express)

3. **Open in Browser**
Navigate to [http://localhost:5173](http://localhost:5173) and create an account or login.

## 📦 Available Scripts

```bash
# Run both frontend and backend concurrently
npm run dev

# Run only frontend (Vite dev server)
npm run dev:web

# Run only backend (Node.js with watch mode)
npm run dev:api

# Build for production
npm run build

# Type-check and build
npm run check

# Start production server (requires build first)
npm run start

# Preview production build locally
npm run preview
```

## 📁 Project Structure

```
expense-tracker-react-project/
├── src/                          # Frontend source code
│   ├── components/
│   │   ├── auth/                # Authentication pages & forms
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   ├── ForgotPasswordForm.tsx
│   │   │   └── ...
│   │   ├── ui/                  # Reusable UI components
│   │   │   └── Modal.tsx
│   │   ├── AddExpenseModal.tsx
│   │   ├── TransactionsTable.tsx
│   │   ├── MonthlyOverview.tsx
│   │   ├── YearlyTrends.tsx
│   │   ├── SpendingInsights.tsx
│   │   ├── MoneyStoryTimeline.tsx
│   │   └── ...
│   ├── api/
│   │   ├── client.ts            # Central API client
│   │   └── auth.ts              # Auth API calls
│   ├── hooks/
│   │   ├── useAuth.ts           # Authentication hook
│   │   └── useDB.ts             # Database operations
│   ├── utils/
│   │   └── cn.ts                # Utility functions
│   ├── db/
│   │   └── database.ts          # Client-side database schema
│   ├── App.tsx                  # Main component
│   ├── main.tsx                 # Entry point
│   └── index.css                # Global styles
├── server/                       # Backend source code
│   ├── index.js                 # Express server entry point
│   ├── routes/
│   │   └── auth.js              # Authentication endpoints
│   ├── middleware/
│   │   ├── auth.js              # JWT verification middleware
│   │   └── rateLimiter.js       # Rate limiting setup
│   └── lib/
│       ├── aiNarrator.js        # AI spending narratives
│       ├── moneyCoach.js        # Money coach recommendations
│       ├── mailer.js            # Email service
│       └── currency.js          # Currency conversion utilities
├── package.json                 # Project dependencies
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript configuration
├── start.sh                      # Quick start script
└── README.md                     # This file
```

## 🔐 Authentication

The application uses JWT (JSON Web Tokens) for secure authentication:

1. **Registration**: New users create an account with email and password
2. **Login**: Users authenticate with credentials and receive a JWT token
3. **Token Storage**: Token is stored in `localStorage` on the client
4. **Requests**: All API requests include the token in the `Authorization` header
5. **Verification**: Backend middleware verifies tokens on protected routes
6. **Password Reset**: Optional email-based password reset functionality

## 💾 Database

- **SQLite** database stored at: `expenseiq.db` (created automatically)
- **WAL Mode**: Write-Ahead Logging for better performance and concurrency
- **Foreign Keys**: Enabled for referential integrity
- **Auto-created**: Database schema initializes on first server start

**Tables**:
- `users` - User accounts and authentication
- `expenses` - Individual expense records
- `recurring_rules` - Recurring expense configurations
- `budgets` - Budget limits and tracking
- `categories` - Expense categories

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Expenses
- `GET /api/expenses` - List all expenses (paginated)
- `POST /api/expenses` - Create new expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense
- `GET /api/expenses/export` - Export as CSV

### Budgets
- `GET /api/budgets` - Get all budgets
- `POST /api/budgets` - Create/update budget
- `DELETE /api/budgets/:id` - Delete budget

### Recurring Expenses
- `GET /api/recurring` - List recurring rules
- `POST /api/recurring` - Create recurring rule
- `DELETE /api/recurring/:id` - Cancel recurring expense

### Insights
- `GET /api/insights/monthly` - Monthly spending analysis
- `GET /api/insights/yearly` - Yearly trends
- `GET /api/insights/categories` - Category breakdown
- `GET /api/coach/narrative` - AI spending narrative

## 🔧 Configuration

### Environment Variables (Optional)

Create a `.env` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# Frontend
VITE_API_BASE_URL=/api

# CORS
CORS_ORIGIN=http://localhost:5173

# Authentication
JWT_SECRET=your-super-secret-key-here

# Optional: Bootstrap User (auto-created on startup)
BOOTSTRAP_USER_EMAIL=demo@example.com
BOOTSTRAP_USER_PASSWORD=demo123

# Optional: Email Configuration (for password resets)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
APP_BASE_URL=http://localhost:5173

# Optional: AI Features
OPENAI_API_KEY=sk-...
```

## 📊 Development Workflow

### Hot Reload
- **Frontend**: Vite automatically reloads when you save changes
- **Backend**: Node.js `--watch` flag restarts server on file changes

### Type Checking
```bash
npm run check  # TypeScript compilation check
```

### Database Reset
Delete the database file and restart:
```bash
rm expenseiq.db
npm run dev
```

## 🚢 Production Deployment

### Build
```bash
npm run build
```

This creates an optimized production build in the `dist/` directory.

### Run Production Server
```bash
npm start
```

The Express server will:
- Serve the built frontend from `dist/`
- Handle all API requests at `/api/*`
- Run on port 3001 (or custom PORT in environment)

### Docker (Optional)

Create a `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t expenseiq .
docker run -p 3001:3001 expenseiq
```

## 🐛 Troubleshooting

### Ports Already in Use

Find and kill processes using the ports (macOS):
```bash
# Port 5173 (Vite)
lsof -ti:5173 | xargs kill -9

# Port 3001 (Express)
lsof -ti:3001 | xargs kill -9
```

### Database Locked
If you see database lock errors:
```bash
rm expenseiq.db
rm expenseiq.db-shm
rm expenseiq.db-wal
npm run dev
```

### Module Not Found
Clear node_modules and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Build Fails
Ensure TypeScript compiles:
```bash
npm run check
```

## 📈 Performance Tips

- Use the CSV export for large data analysis
- Archives old transactions to improve query speed
- Indexes on `user_id`, `date`, and `category` for faster queries
- Budget summaries cache computed values

## 🤝 Contributing

Feel free to fork, modify, and submit improvements!

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🙏 Credits

- Built with React, Node.js, and SQLite
- Icons from Lucide React
- Charts powered by Recharts
- Styling with Tailwind CSS

---

**Happy tracking! Track your expenses, achieve your financial goals. 💰📊**

Application data is stored in:

```text
expenseiq.db
```

That file lives in the project root by default. For real deployments, back up the database file and place it on persistent storage.

## Backup and Restore

- Use **Settings → Data & Storage → Download JSON Backup** for a portable export
- Use **Restore from Backup** to import a previous export

## Current Product Features

- Private user accounts with email/password login
- Password reset flow for account recovery
- SMTP-backed reset emails in production when configured
- Monthly dashboard with smart insights
- Expenses, India remittances, and investments
- Budget setup by month
- Recurring expense rules that auto-create monthly entries
- Transaction search and filtering
- Money Coach analysis:
  - why this month changed
  - can-I-afford-it checks
  - lifestyle drift detection
  - monthly money memo
- Money Story Timeline for account history milestones
- Subscription Drift Detector for rising recurring charges
- Multi-currency entry support with preferred display currency
- JSON backup and CSV export

## Handy Commands

```bash
npm run check
npm run build
npm run start
```
