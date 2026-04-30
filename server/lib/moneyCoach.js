function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentChange(current, baseline) {
  if (!baseline) return null;
  return ((current - baseline) / baseline) * 100;
}

function normalizeDescription(description) {
  return String(description ?? '')
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sumAmounts(rows) {
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function getCategoryTotals(expenses) {
  return expenses.reduce((totals, expense) => {
    totals[expense.category] = (totals[expense.category] ?? 0) + Number(expense.amount || 0);
    return totals;
  }, {});
}

function createSnapshot(summary) {
  const totalExpenses = sumAmounts(summary.expenses);
  const totalInvested = sumAmounts(summary.investments);
  const totalRemittances = sumAmounts(summary.remittances);
  const totalRecurringExpenses = sumAmounts(summary.expenses.filter((expense) => expense.recurring_rule_id));

  return {
    month: summary.month,
    config: summary.config ?? null,
    expenses: summary.expenses,
    investments: summary.investments,
    remittances: summary.remittances,
    byCategory: getCategoryTotals(summary.expenses),
    totalExpenses,
    totalInvested,
    totalRemittances,
    totalSpent: totalExpenses + totalInvested,
    totalRecurringExpenses,
  };
}

function pickHeadline({ deltaFromPrevious, topDriver, lifestyleDrift }) {
  if (topDriver && Math.abs(topDriver.deltaFromPrevious) >= 25) {
    return `${topDriver.category} is steering this month`;
  }
  if (lifestyleDrift.length > 0 && lifestyleDrift[0].status === 'up') {
    return `${lifestyleDrift[0].category} is slowly climbing`;
  }
  if (deltaFromPrevious > 0) {
    return 'Spending ran warmer than last month';
  }
  if (deltaFromPrevious < 0) {
    return 'You tightened things up this month';
  }
  return 'This month stayed pretty steady';
}

function buildWhatChanged(month, previousMonth, deltaFromPrevious, deltaFromAverage, topDrivers) {
  if (deltaFromPrevious === 0 && deltaFromAverage === 0) {
    return `${monthLabel(month)} landed almost exactly where your recent pace has been.`;
  }

  const parts = [];
  if (deltaFromPrevious !== 0) {
    parts.push(
      `${monthLabel(month)} was ${deltaFromPrevious > 0 ? 'up' : 'down'} $${Math.abs(deltaFromPrevious).toFixed(0)} versus ${monthLabel(previousMonth)}`
    );
  }
  if (deltaFromAverage !== 0) {
    parts.push(
      `${deltaFromAverage > 0 ? 'running above' : 'sitting below'} your 3-month average by $${Math.abs(deltaFromAverage).toFixed(0)}`
    );
  }
  if (topDrivers.length > 0) {
    parts.push(`with the biggest push coming from ${topDrivers[0].category.toLowerCase()}`);
  }

  return `${parts.join(', ')}.`;
}

function buildWhatWentWell(snapshot, unusualPurchases) {
  if (snapshot.totalSpent === 0) {
    return 'You have not logged much yet, which gives the app time to learn your baseline before making stronger calls.';
  }
  if (snapshot.config && snapshot.totalSpent <= snapshot.config.misc_budget + snapshot.config.invest_amount) {
    return `You are still inside your planned monthly budget, with $${Math.max((snapshot.config.misc_budget + snapshot.config.invest_amount) - snapshot.totalSpent, 0).toFixed(0)} of room left.`;
  }
  if (unusualPurchases.length === 0) {
    return 'Nothing looked wildly out of pattern, which usually means this month was driven by normal life rather than one expensive surprise.';
  }
  return 'Most of your activity still came from familiar categories, so the month is understandable even if one or two purchases stood out.';
}

function buildWatchNext(recurringCostIncreases, unusualPurchases, lifestyleDrift) {
  if (recurringCostIncreases.length > 0) {
    const item = recurringCostIncreases[0];
    return `${item.description} is costing more than its past pattern, so keep an eye on whether that increase sticks next month.`;
  }
  if (lifestyleDrift.length > 0 && lifestyleDrift[0].status === 'up') {
    const drift = lifestyleDrift[0];
    return `${drift.category} has been moving up ${drift.trend === 'trend' ? 'across multiple months' : 'recently'}, so that category is worth watching.`;
  }
  if (unusualPurchases.length > 0) {
    return `${unusualPurchases[0].description} was a clear outlier this month, so next month should normalize if it was a one-off.`;
  }
  return 'No single category is flashing bright red right now, so next month is mostly about staying consistent.';
}

function buildSuggestedAction(topDrivers, lifestyleDrift, unusualPurchases) {
  if (topDrivers.length > 0 && topDrivers[0].current > 0) {
    return `Set a soft cap for ${topDrivers[0].category.toLowerCase()} next month and check in halfway through the month instead of waiting until the end.`;
  }
  if (lifestyleDrift.length > 0) {
    return `Review your last few ${lifestyleDrift[0].category.toLowerCase()} purchases and decide which one you would happily skip once.`;
  }
  if (unusualPurchases.length > 0) {
    return `Treat ${unusualPurchases[0].description} as a special-case spend and avoid letting it reset what feels normal next month.`;
  }
  return 'Keep logging consistently so the coach can get sharper about your real spending patterns.';
}

export function buildMonthlyAnalysis({
  month,
  currentSummary,
  previousSummary,
  trailingSummaries,
  sixMonthSummaries,
  expectedRecurringForMonth,
  now,
}) {
  const current = createSnapshot(currentSummary);
  const previous = createSnapshot(previousSummary);
  const trailing = trailingSummaries.map(createSnapshot);
  const sixMonth = sixMonthSummaries.map(createSnapshot);
  const previousMonth = previous.month;

  const trailingAverageSpent = average(trailing.map((entry) => entry.totalSpent));
  const trailingAverageExpenseOnly = average(trailing.map((entry) => entry.totalExpenses));
  const deltaFromPrevious = current.totalSpent - previous.totalSpent;
  const deltaFromAverage = current.totalSpent - trailingAverageSpent;
  const categorySet = new Set([
    ...Object.keys(current.byCategory),
    ...Object.keys(previous.byCategory),
    ...trailing.flatMap((entry) => Object.keys(entry.byCategory)),
  ]);

  const biggestDrivers = [...categorySet]
    .map((category) => {
      const currentAmount = current.byCategory[category] ?? 0;
      const previousAmount = previous.byCategory[category] ?? 0;
      const averageAmount = average(trailing.map((entry) => entry.byCategory[category] ?? 0));
      return {
        category,
        current: currentAmount,
        previous: previousAmount,
        average: averageAmount,
        deltaFromPrevious: currentAmount - previousAmount,
        deltaFromAverage: currentAmount - averageAmount,
        shareOfCurrent: current.totalExpenses > 0 ? (currentAmount / current.totalExpenses) * 100 : 0,
      };
    })
    .filter((entry) => entry.current > 0 || Math.abs(entry.deltaFromPrevious) >= 10 || Math.abs(entry.deltaFromAverage) >= 10)
    .sort((left, right) => Math.max(Math.abs(right.deltaFromPrevious), Math.abs(right.deltaFromAverage)) - Math.max(Math.abs(left.deltaFromPrevious), Math.abs(left.deltaFromAverage)))
    .slice(0, 4);

  const priorExpenses = sixMonth
    .flatMap((entry) => entry.expenses)
    .filter((expense) => expense.month !== month);

  const currentMonthAverageExpense = average(current.expenses.map((expense) => Number(expense.amount || 0)));
  const unusualPurchases = current.expenses
    .map((expense) => {
      const key = normalizeDescription(expense.description);
      const relatedHistory = priorExpenses.filter((candidate) => normalizeDescription(candidate.description) === key);
      const baselineAmount = relatedHistory.length > 0
        ? average(relatedHistory.map((candidate) => Number(candidate.amount || 0)))
        : null;
      const isOutlier = baselineAmount
        ? Number(expense.amount) >= baselineAmount * 1.25 && (Number(expense.amount) - baselineAmount) >= 12
        : Number(expense.amount) >= Math.max(currentMonthAverageExpense * 1.75, 120);

      if (!isOutlier) return null;

      return {
        id: expense.id,
        description: expense.description,
        amount: Number(expense.amount),
        category: expense.category,
        date: expense.date,
        baselineAmount,
        reason: baselineAmount
          ? `About $${(Number(expense.amount) - baselineAmount).toFixed(0)} above your usual level for this purchase`
          : 'Meaningfully larger than your typical expense size this month',
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 4);

  const groupedByDescription = sixMonth
    .flatMap((entry) => entry.expenses)
    .reduce((groups, expense) => {
      const key = normalizeDescription(expense.description);
      if (!key) return groups;
      groups[key] = groups[key] ?? [];
      groups[key].push(expense);
      return groups;
    }, {});

  const recurringCostIncreases = current.expenses
    .map((expense) => {
      const key = normalizeDescription(expense.description);
      const group = groupedByDescription[key] ?? [];
      const previousRows = group.filter((row) => row.month !== month);
      const previousMonthsSeen = new Set(previousRows.map((row) => row.month)).size;
      if (previousMonthsSeen < 2) return null;

      const currentRows = group.filter((row) => row.month === month);
      const currentAmount = average(currentRows.map((row) => Number(row.amount || 0)));
      const previousAverage = average(previousRows.map((row) => Number(row.amount || 0)));
      const increaseAmount = currentAmount - previousAverage;

      if (increaseAmount < 10 || currentAmount < previousAverage * 1.1) {
        return null;
      }

      return {
        description: expense.description,
        currentAmount,
        previousAverage,
        increaseAmount,
        increasePercent: previousAverage ? (increaseAmount / previousAverage) * 100 : 0,
        monthsSeen: previousMonthsSeen + 1,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.increaseAmount - left.increaseAmount)
    .slice(0, 3);

  const recentWindow = sixMonth.slice(-3);
  const baselineWindow = sixMonth.slice(0, 3);
  const lifestyleCategories = new Set([
    ...recentWindow.flatMap((entry) => Object.keys(entry.byCategory)),
    ...baselineWindow.flatMap((entry) => Object.keys(entry.byCategory)),
  ]);

  const lifestyleDrift = [...lifestyleCategories]
    .map((category) => {
      const recentValues = recentWindow.map((entry) => entry.byCategory[category] ?? 0);
      const baselineValues = baselineWindow.map((entry) => entry.byCategory[category] ?? 0);
      const recentAverage = average(recentValues);
      const baselineAverage = average(baselineValues);
      const changeAmount = recentAverage - baselineAverage;
      const changePercent = percentChange(recentAverage, baselineAverage);
      const monthsAbove = baselineAverage > 0
        ? recentValues.filter((value) => value > baselineAverage * 1.1).length
        : recentValues.filter((value) => value > 0).length;
      const monthsBelow = baselineAverage > 0
        ? recentValues.filter((value) => value < baselineAverage * 0.9).length
        : 0;

      let status = 'steady';
      if ((baselineAverage === 0 && recentAverage > 0) || (baselineAverage > 0 && recentAverage > baselineAverage * 1.15 && changeAmount >= 10)) {
        status = 'up';
      } else if (baselineAverage > 0 && recentAverage < baselineAverage * 0.85 && Math.abs(changeAmount) >= 10) {
        status = 'down';
      }

      return {
        category,
        recentAverage,
        baselineAverage,
        changeAmount,
        changePercent,
        status,
        trend: status === 'up'
          ? (monthsAbove >= 2 ? 'trend' : 'one-off')
          : status === 'down'
            ? (monthsBelow >= 2 ? 'trend' : 'one-off')
            : 'one-off',
      };
    })
    .filter((entry) => entry.recentAverage > 0 || entry.baselineAverage > 0)
    .sort((left, right) => Math.abs(right.changeAmount) - Math.abs(left.changeAmount))
    .slice(0, 5);

  const effectiveBudget = (current.config?.misc_budget ?? average(trailing.map((entry) => entry.config?.misc_budget ?? 0))) + (current.config?.invest_amount ?? 2500);
  const projectedMonthEndSpend = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    ? current.totalSpent + ((current.totalSpent / Math.max(now.getDate(), 1)) * Math.max(daysInMonth(month) - now.getDate(), 0))
    : Math.max(current.totalSpent, trailingAverageSpent);

  const monthlyMemo = {
    headline: pickHeadline({
      deltaFromPrevious,
      topDriver: biggestDrivers[0],
      lifestyleDrift,
    }),
    whatChanged: buildWhatChanged(month, previousMonth, deltaFromPrevious, deltaFromAverage, biggestDrivers),
    whatWentWell: buildWhatWentWell(current, unusualPurchases),
    watchNext: buildWatchNext(recurringCostIncreases, unusualPurchases, lifestyleDrift),
    suggestedAction: buildSuggestedAction(biggestDrivers, lifestyleDrift, unusualPurchases),
  };

  return {
    month,
    monthLabel: monthLabel(month),
    previousMonth,
    previousMonthLabel: monthLabel(previousMonth),
    trailingAverageMonths: trailing.map((entry) => entry.month),
    totals: {
      currentSpent: current.totalSpent,
      currentExpenses: current.totalExpenses,
      currentInvested: current.totalInvested,
      currentRemittances: current.totalRemittances,
      previousSpent: previous.totalSpent,
      trailingAverageSpent,
      trailingAverageExpenseOnly,
      budget: effectiveBudget,
      remainingBudget: effectiveBudget - current.totalSpent,
      expectedRecurringForMonth,
      recurringAlreadyLogged: current.totalRecurringExpenses,
      projectedMonthEndSpend,
    },
    whyDifferent: {
      summary: buildWhatChanged(month, previousMonth, deltaFromPrevious, deltaFromAverage, biggestDrivers),
      deltaFromPrevious,
      deltaFromPreviousPercent: percentChange(current.totalSpent, previous.totalSpent),
      deltaFromAverage,
      deltaFromAveragePercent: percentChange(current.totalSpent, trailingAverageSpent),
      biggestDrivers,
      unusualPurchases,
      recurringCostIncreases,
    },
    lifestyleDrift: {
      summary: lifestyleDrift.length > 0
        ? `${lifestyleDrift[0].category} is the clearest ${lifestyleDrift[0].trend === 'trend' ? 'multi-month' : 'recent'} movement in your habits.`
        : 'Your category mix has been fairly stable over the last few months.',
      categories: lifestyleDrift,
    },
    monthlyMemo,
  };
}

export function buildAffordabilityCheck({
  month,
  amount,
  label,
  currentSummary,
  trailingSummaries,
  expectedRecurringForMonth,
  now,
}) {
  const current = createSnapshot(currentSummary);
  const trailing = trailingSummaries.map(createSnapshot);
  const trailingAverageSpent = average(trailing.map((entry) => entry.totalSpent));
  const trailingAverageMonthlyBudget = average(
    trailing.map((entry) => (entry.config?.misc_budget ?? 0) + (entry.config?.invest_amount ?? 2500))
  );
  const fallbackMiscBudget = Math.max((trailingAverageMonthlyBudget || 2500) - 2500, 0);
  const budget = (current.config?.misc_budget ?? fallbackMiscBudget) + (current.config?.invest_amount ?? 2500);
  const recurringGap = Math.max(expectedRecurringForMonth - current.totalRecurringExpenses, 0);
  const remainingBudget = budget - current.totalSpent;
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = month === currentMonthKey;
  const remainingDays = Math.max(daysInMonth(month) - (isCurrentMonth ? now.getDate() : 0), 0);
  const dailyBurn = isCurrentMonth
    ? current.totalSpent / Math.max(now.getDate(), 1)
    : trailingAverageSpent / Math.max(average(trailing.map((entry) => daysInMonth(entry.month))), 30);
  const projectedWithoutPurchase = isCurrentMonth
    ? current.totalSpent + (dailyBurn * remainingDays)
    : Math.max(current.totalSpent + recurringGap, trailingAverageSpent);
  const projectedAfterPurchase = projectedWithoutPurchase + amount;
  const safetyBuffer = Math.max(100, budget * 0.08);
  const slackAfterPurchase = budget - projectedAfterPurchase;

  let status = 'green';
  if (slackAfterPurchase < 0 || amount > remainingBudget) {
    status = 'red';
  } else if (slackAfterPurchase < safetyBuffer) {
    status = 'yellow';
  }

  const reasons = [
    `Your working budget for ${monthLabel(month)} is about $${budget.toFixed(0)}.`,
    `You have roughly $${Math.max(remainingBudget, 0).toFixed(0)} left before this purchase based on what is already logged.`,
    recurringGap > 0
      ? `About $${recurringGap.toFixed(0)} of recurring spending is still expected for that month.`
      : 'Most recurring spending for that month is already accounted for in your plan.',
    `At your recent pace, month-end spending would land near $${projectedWithoutPurchase.toFixed(0)} before this purchase.`,
  ];

  const explanation = status === 'green'
    ? `${label ? `${label} looks` : 'This looks'} comfortable inside your current pace and budget.`
    : status === 'yellow'
      ? `${label ? `${label} is` : 'This is'} possible, but it would leave a thinner-than-usual buffer.`
      : `${label ? `${label} would` : 'This would'} likely push the month past a comfortable range.`;

  return {
    status,
    amount,
    label: label?.trim() || null,
    budget,
    remainingBudget,
    projectedWithoutPurchase,
    projectedAfterPurchase,
    safetyBuffer,
    recurringGap,
    trailingAverageSpent,
    explanation,
    reasons,
  };
}

export { monthLabel, shiftMonth };
