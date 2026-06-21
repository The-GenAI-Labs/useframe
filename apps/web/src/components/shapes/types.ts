
export type Corner = "TL" | "TR" | "BR" | "BL";

export interface CornerRadii {
  radius?: number;
  radiusTL?: number;
  radiusTR?: number;
  radiusBR?: number;
  radiusBL?: number;
}

export interface BaseShapeParams extends CornerRadii {
  width: number;
  height: number;
  smoothing?: number;
}

export interface FiveCornerParams extends BaseShapeParams {
  notchDepth?: number;
  notchCorner?: Corner;
}

export interface SevenCornerParams extends BaseShapeParams {
  notchDepth?: number;
  notchWidth?: number;
  notchCorner?: Corner;
}
