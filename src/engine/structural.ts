// src/engine/structural.ts
/** --------------------------------------------------------------
 *  STRUCTURAL SIZING — ground-mount PV racking
 *  Wind:  ASCE 7-22 Ch. 29 (velocity pressure qz = 0.613·Kz·Kzt·Kd·V²)
 *  Snow:  ASCE 7-22 Ch. 7  (Ps = 0.7·Ce·Ct·I·Pg)
 *  Piles: Broms (1964) short-pile method
 *  Tube:  simply-supported beam, Mmax = wL²/8
 *  Assumptions: no seismic, no flood/scour, no corrosion allowance,
 *  rigid structure (G=0.85), tracker stowed flat at 0°.
 *  SI units throughout.
 * -------------------------------------------------------------- */

export interface StructuralInputs {
  rowCount: number;
  modulesPerRow: number;
  moduleWidth: number;       // m
  moduleHeight: number;      // m
  pitch: number;             // m row-to-row
  mountHeight: number;       // m
  tilt: number;              // deg
  tracker: boolean;
  windSpeed: number;         // m/s, 3-sec gust
  windExposure: 'B' | 'C' | 'D';
  groundSnowKPa: number;
  soilType: 'cohesionless' | 'cohesive';
  soilPhiDeg: number;        // friction angle (sand)
  soilCKPa: number;          // cohesion (clay)
  steelGrade: 'A500_GrB' | 'A500_GrC' | 'A572_Gr50';
}

export interface StructuralOutputs {
  pileDiameter: number;
  pileEmbedment: number;
  pileCount: number;
  pileSteelKg: number;
  torqueTubeOD: number;      // mm
  torqueTubeWall: number;    // mm
  maxBendingStressMPa: number;
  utilizationRatio: number;
  concreteVolumeM3: number;
  structuralSteelKgPerMWdc: number;
  structuralCostPerWdc: number;
  governingWindPressurePa: number;
}

const FY_MPA: Record<StructuralInputs['steelGrade'], number> = {
  A500_GrB: 315, A500_GrC: 345, A572_Gr50: 345,
};

/** ASCE 7-22 Table 26.11-1 velocity pressure exposure coefficient */
function Kz(exposure: 'B' | 'C' | 'D', z: number): number {
  const zC = Math.max(z, 4.6); // ASCE minimum height
  const params = { B: { alpha: 7.0, zg: 365.8 }, C: { alpha: 9.5, zg: 274.3 }, D: { alpha: 11.5, zg: 213.4 } };
  const { alpha, zg } = params[exposure];
  return 2.01 * Math.pow(zC / zg, 2 / alpha);
}

/** Standard tube candidates [OD mm, wall mm] — lightest first */
const TUBE_SIZES: Array<[number, number]> = [
  [100, 3], [114, 3], [114, 4], [127, 4], [139, 4], [150, 4], [150, 5], [150, 6],
];

export function sizeStructure(inp: StructuralInputs): StructuralOutputs {
  // ---- 1. Wind load (ASCE 7-22 §29.4, simplified) ----
  const kz = Kz(inp.windExposure, inp.mountHeight);
  const kzt = 1.0, kd = 0.85;
  const qz = 0.613 * kz * kzt * kd * inp.windSpeed ** 2;         // Pa
  const G = 0.85, Cf = 1.3;                                       // rigid, flat-plate normal
  const stowTilt = inp.tracker ? 0 : inp.tilt;                    // tracker stows flat
  const areaPerRow = inp.modulesPerRow * inp.moduleWidth * inp.moduleHeight * Math.cos(stowTilt * Math.PI / 180);
  const windPerRow = qz * G * Cf * areaPerRow;                    // N

  // ---- 2. Snow load (ASCE 7-22 §7.3) ----
  const ps = 0.7 * 1.0 * 1.1 * 1.0 * inp.groundSnowKPa * 1000;    // Pa (Ce=1.0, Ct=1.1, I=1.0)
  const snowPerRow = ps * areaPerRow;                             // N

  // ---- 3. Piles (Broms 1964) ----
  const pilesPerRow = inp.tracker ? 2 : 3;
  const pileCount = inp.rowCount * pilesPerRow;
  const pileDiameter = 0.2;                                       // m (200mm typical driven pile)
  const momentPerPile = (windPerRow / pilesPerRow) * inp.mountHeight / 1000; // kN·m at groundline

  let embedment: number;
  if (inp.soilType === 'cohesionless') {
    const kp = Math.tan((45 + inp.soilPhiDeg / 2) * Math.PI / 180) ** 2; // Rankine passive
    const gamma = 18;                                             // kN/m³ effective unit weight
    embedment = Math.cbrt(momentPerPile / (0.5 * gamma * kp * pileDiameter ** 3));
  } else {
    embedment = momentPerPile / (9 * Math.max(inp.soilCKPa, 1) * pileDiameter);
  }
  embedment = Math.max(embedment, 0.8) + 0.5;                     // min depth + safety allowance

  // Pile steel: circular tube 200mm OD × 5mm wall, length = embedment + mountHeight
  const pileWall = 0.005;
  const pileAreaSteel = Math.PI / 4 * (pileDiameter ** 2 - (pileDiameter - 2 * pileWall) ** 2);
  const pileSteelKg = pileCount * pileAreaSteel * (embedment + inp.mountHeight) * 7850;

  // ---- 4. Torque tube (simply supported, span = pitch) ----
  const deadPerM = (inp.modulesPerRow * inp.moduleWidth * inp.moduleHeight * 12 * 9.81) /
    (inp.modulesPerRow * inp.moduleWidth);                        // ~12 kg/m² modules
  const wTotal = (windPerRow + snowPerRow) / (inp.modulesPerRow * inp.moduleWidth) + deadPerM; // N/m
  const mMax = wTotal * inp.pitch ** 2 / 8;                       // N·m
  const fy = FY_MPA[inp.steelGrade] * 1e6;                        // Pa

  let od = 150, wall = 6, stress = 0, utilization = 99;
  for (const [odMm, wallMm] of TUBE_SIZES) {
    const D = odMm / 1000, d = (odMm - 2 * wallMm) / 1000;
    const S = Math.PI * (D ** 4 - d ** 4) / (32 * D);             // section modulus m³
    stress = mMax / S / 1e6;                                      // MPa
    utilization = stress / (0.9 * FY_MPA[inp.steelGrade]);
    if (utilization < 1.0) { od = odMm; wall = wallMm; break; }
  }
  void fy;

  // ---- 5. Totals & cost ----
  const tubeAreaSteel = Math.PI / 4 * ((od / 1000) ** 2 - ((od - 2 * wall) / 1000) ** 2);
  const rowLength = inp.modulesPerRow * inp.moduleWidth;
  const tubeSteelKg = inp.rowCount * rowLength * tubeAreaSteel * 7850;
  const totalSteelKg = pileSteelKg + tubeSteelKg;

  const nameplateWdc = inp.rowCount * inp.modulesPerRow * 550;    // approx, refined by caller if needed
  const concreteVolumeM3 = 0;                                     // driven piles → no concrete
  const steelCostPerKg = 3.0, installPerPile = 65;
  const structuralCost = totalSteelKg * steelCostPerKg + pileCount * installPerPile;

  return {
    pileDiameter, pileEmbedment: embedment, pileCount, pileSteelKg,
    torqueTubeOD: od, torqueTubeWall: wall,
    maxBendingStressMPa: stress, utilizationRatio: utilization,
    concreteVolumeM3,
    structuralSteelKgPerMWdc: nameplateWdc > 0 ? totalSteelKg / (nameplateWdc / 1e6) : 0,
    structuralCostPerWdc: nameplateWdc > 0 ? structuralCost / nameplateWdc : 0,
    governingWindPressurePa: qz,
  };
}