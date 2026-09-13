interface ProjectAmounts {
  status: string;
  totalPrice: number;
  totalCost: number;
  amountPaid: number;
}

/** Project estimates, not a general ledger or realized profit statement. */
export function summarizeProjectAmounts(projects: ProjectAmounts[]) {
  const included = projects.filter((project) => project.status !== "CANCELLED");
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const sum = (select: (project: ProjectAmounts) => number) => money(included.reduce((total, project) => total + select(project), 0));
  const totalRevenue = sum((project) => project.totalPrice);
  const totalCosts = sum((project) => project.totalCost);
  return {
    totalRevenue,
    totalCosts,
    totalCollected: sum((project) => project.amountPaid),
    // An overpayment on one project must never hide another client's debt.
    totalPending: sum((project) => Math.max(0, project.totalPrice - project.amountPaid)),
    totalProfit: money(totalRevenue - totalCosts),
    profitMargin: totalRevenue > 0 ? `${((totalRevenue - totalCosts) / totalRevenue * 100).toFixed(1)}%` : "0%",
  };
}
