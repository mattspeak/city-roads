import tinycolor from 'tinycolor2';

/**
 * Piste difficulty color scheme (standard ski map conventions)
 */
const DIFFICULTY_COLORS = {
  novice:       '#22C55E',  // Green - beginner
  easy:         '#3B82F6',  // Blue - easy
  intermediate: '#EF4444',  // Red - intermediate
  advanced:     '#1A1A1A',  // Black - advanced
  expert:       '#1A1A1A',  // Black - expert (same as advanced)
  freeride:     '#F97316',  // Orange - off-piste
  unknown:      '#9CA3AF',  // Gray - untagged pistes
};

/**
 * Lift/aerialway color
 */
const AERIALWAY_COLOR = '#6B7280';  // Neutral grey

export default {
  /**
   * This is our caching backend
   */
  // This used to work, but seems like GitHub no longer allows large website hosting:
  //areaServer: 'https://anvaka.github.io/index-large-cities/data',
  //areaServer: 'http://localhost:8085', // This is un-commented when I develop cache locally
  // So, using S3
  areaServer: 'https://city-roads.s3-us-west-2.amazonaws.com/nov-02-2020',

  getDefaultLineColor() {
    return tinycolor('rgba(26, 26, 26, 0.8)');
  },
  getLabelColor() {
    return tinycolor('#161616');
  },

  getBackgroundColor() {
    return tinycolor('#F7F2E8');
  },

  /**
   * Get all difficulty colors as an object
   */
  getDifficultyColors() {
    return DIFFICULTY_COLORS;
  },

  /**
   * Get color for a specific difficulty level
   */
  getDifficultyColor(difficulty) {
    const color = DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS.unknown;
    return tinycolor(color);
  },

  /**
   * Get the aerialway/lift color
   */
  getAerialwayColor() {
    return tinycolor(AERIALWAY_COLOR);
  },
}