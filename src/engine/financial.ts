// src/engine/financial.ts
/** --------------------------------------------------------------
 *  PROJECT FINANCE WATERFALL — LCOE / NPV / IRR / DSCR
 *  Method per NREL ATB / SAM. 5-yr MACRS (IRS Pub. 946).
 *  Depreciable basis reduced by 50% of ITC (26 USC §50(c)).
 *  LCOE = NPV(costs) / NPV(degraded energy), discounted at WACC.
 *  Real LCOE uses real discount rate (1+nom)/(1+infl) − 1.
 * -------------------------------------------------------------- */

export interface ProjectFinanceInputs {
  annualAcMWhYear1: number;
  degradationAnnual: number;    // fraction/yr
  lifetimeYears: number;
  capexTotal: number;           // $
  nameplateKWac: number;
  opexPerKwacYr: number;
  opexEscalation: number;
  ppaPricePerMWh: number;
  ppaEscalation: number;
  wacc: number;
  debtFraction: number;
  debtRate: number;
  debtTermYears: number;
  taxRate: number;
  itc: number;                  // 0.30 US, 0 elsewhere
  macrs: boolean;
  curtailmentPct: number;
  inflationPct: number;
}

export interface YearCashflow {
  year: number; revenue: number; opex: number;
  debtService: number; tax: number; netCF: number; dscr: number;
}

export interface ProjectFinanceOutputs {
  lcoeNominal: number;
  lcoeReal: number;
  npv: number;
  equityIRR: number | null;
  paybackYears: number | null;
  dscrMin: number;
  dscrAvg: number;
  cashflowYearly: YearCashflow[];
}

const MACRS_5YR = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576];

function irrBisection(cfs: number[]): number | null {
  const npv = (r: number) => cfs.reduce((s, cf, t) => s + cf / (1 + r) ** t, 0);
  let lo = -0.99, hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function runProjectFinance(inp: ProjectFinanceInputs): ProjectFinanceOutputs {
  const debt = inp.capexTotal * inp.debtFraction;
  const equity = inp.capexTotal - debt;
  const n = Math.max(1, Math.round(inp.debtTermYears));
  const r = inp.debtRate;
  const debtService = r > 0 ? debt * r / (1 - (1 + r) ** -n) : debt / n; // PMT

  const itcBenefit = inp.capexTotal * inp.itc;
  const depBasis = inp.capexTotal * (1 - 0.5 * inp.itc);         // §50(c) basis reduction

  const years = Math.max(1, Math.round(inp.lifetimeYears));
  const cashflowYearly: YearCashflow[] = [];
  const equityCFs: number[] = [-equity + itcBenefit];            // year 0

  let npv = -equity + itcBenefit;
  let dscrMin = Infinity, dscrSum = 0, dscrCount = 0;
  let cumulative = -equity + itcBenefit;
  let paybackYears: number | null = null;

  // LCOE accumulators (nominal & real)
  let costNPV = inp.capexTotal, costNPVReal = inp.capexTotal;
  let energyNPV = 0, energyNPVReal = 0;
  const realRate = (1 + inp.wacc) / (1 + inp.inflationPct / 100) - 1;

  for (let y = 1; y <= years; y++) {
    const energyMWh = inp.annualAcMWhYear1 *
      Math.max(0, 1 - inp.degradationAnnual * (y - 1)) *
      (1 - inp.curtailmentPct / 100);
    const revenue = energyMWh * inp.ppaPricePerMWh * (1 + inp.ppaEscalation) ** (y - 1);
    const opex = inp.nameplateKWac * inp.opexPerKwacYr * (1 + inp.opexEscalation) ** (y - 1);
    const depreciation = inp.macrs && y <= 6 ? depBasis * MACRS_5YR[y - 1] : 0;
    const interest = y <= n ? debtService - debt * r * Math.max(0, 1 - (y - 1) / n) : 0; // approx level
    const ds = y <= n ? debtService : 0;
    const taxable = revenue - opex - depreciation - interest;
    const tax = Math.max(0, taxable * inp.taxRate);
    const netCF = revenue - opex - ds - tax;
    const cfads = revenue - opex;
    const dscr = ds > 0 ? cfads / ds : Infinity;

    if (ds > 0) { dscrMin = Math.min(dscrMin, dscr); dscrSum += dscr; dscrCount++; }
    cashflowYearly.push({ year: y, revenue, opex, debtService: ds, tax, netCF, dscr });
    equityCFs.push(netCF);
    npv += netCF / (1 + inp.wacc) ** y;
    cumulative += netCF;
    if (paybackYears === null && cumulative >= 0) paybackYears = y;

    costNPV += (opex + tax) / (1 + inp.wacc) ** y;
    costNPVReal += (opex + tax) / (1 + realRate) ** y;
    energyNPV += energyMWh / (1 + inp.wacc) ** y;
    energyNPVReal += energyMWh / (1 + realRate) ** y;
  }

  return {
    lcoeNominal: energyNPV > 0 ? costNPV / energyNPV : 0,
    lcoeReal: energyNPVReal > 0 ? costNPVReal / energyNPVReal : 0,
    npv,
    equityIRR: irrBisection(equityCFs),
    paybackYears,
    dscrMin: dscrCount > 0 ? dscrMin : Infinity,
    dscrAvg: dscrCount > 0 ? dscrSum / dscrCount : Infinity,
    cashflowYearly,
  };
}