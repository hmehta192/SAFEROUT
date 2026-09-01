export const colors = {
  surface: "#0F1115",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1C1F26",
  onSurfaceSecondary: "#A1A7B3",
  surfaceTertiary: "#282C35",
  onSurfaceTertiary: "#D1D6E0",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0F1115",
  brand: "#FFAB00",
  onBrand: "#000000",
  brandSecondary: "#CC8900",
  brandTertiary: "#332200",
  onBrandTertiary: "#FFAB00",
  success: "#00E676",
  onSuccess: "#000000",
  warning: "#FFEA00",
  error: "#FF3D00",
  onError: "#FFFFFF",
  info: "#29B6F6",
  border: "#282C35",
  borderStrong: "#454B59",
  divider: "#1C1F26",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const fonts = {
  display: "Rajdhani-SemiBold",
  displayMedium: "Rajdhani-Medium",
  displayBold: "Rajdhani-Bold",
  text: "DMSans-Regular",
  textMedium: "DMSans-Medium",
  textBold: "DMSans-Bold",
};

export const statusColor = (status?: string | null) => {
  switch (status) {
    case "started":
      return colors.info;
    case "on_the_way":
      return colors.brand;
    case "reached":
      return colors.success;
    case "ended":
      return colors.onSurfaceSecondary;
    default:
      return colors.onSurfaceSecondary;
  }
};

export const statusLabel = (status?: string | null) => {
  switch (status) {
    case "started":
      return "Trip Started";
    case "on_the_way":
      return "On the Way";
    case "reached":
      return "Reached";
    case "ended":
      return "Ended";
    default:
      return "Not Started";
  }
};
