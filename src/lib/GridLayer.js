import config from '../config.js';
import tinycolor from 'tinycolor2';
import {WireCollection} from 'w-gl';

let counter = 0;

// Difficulty levels for pistes
const DIFFICULTY_LEVELS = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride', 'unknown'];

export default class GridLayer {
  get color() {
    return this._color;
  }

  set color(unsafeColor) {
    let color = tinycolor(unsafeColor);
    this._color = color;
    // For single-color mode (roads), update the lines collection
    if (this.lines) {
      this.lines.color = toRatioColor(color.toRgb());
    }
    if (this.scene) {
      this.scene.renderFrame();
    }
  }

  get lineWidth() {
    return this._lineWidth;
  }

  set lineWidth(newValue) {
    this._lineWidth = newValue;
    if (!this.scene) return;

    // Update line width for all collections
    if (this.lines) {
      this.lines.setLineWidth(newValue);
    }
    if (this.collections) {
      Object.values(this.collections).forEach(col => col.setLineWidth(newValue));
    }
  }

  constructor() {
    this._color = config.getDefaultLineColor();
    this.grid = null;
    this.lines = null;           // Single collection for roads (backwards compat)
    this.collections = null;     // Multiple collections for ski features
    this.scene = null;
    this.dx = 0;
    this.dy = 0;
    this.scale = 1;
    this.hidden = false;
    this.id = 'paths_' + counter;
    this._lineWidth = 1;
    counter += 1;
  }

  getGridProjector() {
    if (this.grid) return this.grid.projector;
  }

  getQueryBounds() {
    const {grid} = this;
    if (grid) {
      if (grid.queryBounds) return grid.queryBounds;
      if (grid.isArea) return {
        areaId: grid.id
      };
    }
  }

  setGrid(grid) {
    this.grid = grid;
    if (this.scene) {
      this.bindToScene(this.scene);
    }
  }

  getViewBox() {
    if (!this.grid) return null;

    let {width, height} = this.grid.getProjectedRect();
    let initialSceneSize = Math.max(width, height) / 4;
    return {
      left:  -initialSceneSize,
      top:    initialSceneSize,
      right:  initialSceneSize,
      bottom: -initialSceneSize,
    };
  }

  moveTo(x, y = 0) {
    console.warn('Please use moveBy() instead. The moveTo() is under construction');
    // this.dx = x;
    // this.dy = y;

    // this._transferTransform();
  }

  moveBy(dx, dy = 0) {
    this.dx = dx;
    this.dy = dy;

    this._transferTransform();
  }

  buildLinesCollection() {
    if (this.lines || this.collections) return;

    let grid = this.grid;

    // Check if we have ski features (pistes or aerialways)
    let hasSkiFeatures = false;
    grid.forEachElement(element => {
      if (element.featureType === 'piste' || element.featureType === 'aerialway') {
        hasSkiFeatures = true;
      }
    });

    if (hasSkiFeatures) {
      this._buildSkiCollections(grid);
    } else {
      this._buildRoadCollection(grid);
    }
  }

  /**
   * Build a single collection for roads (original behavior)
   */
  _buildRoadCollection(grid) {
    let lines = new WireCollection(grid.wayPointCount, {
      width: this._lineWidth,
      allowColors: false,
      is3D: false
    });
    grid.forEachWay(function(from, to) {
      lines.add({from, to});
    });
    let color = tinycolor(this._color).toRgb();
    lines.color = toRatioColor(color);
    lines.id = this.id;

    this.lines = lines;
  }

  /**
   * Build multiple collections for ski features (pistes by difficulty + aerialways)
   */
  _buildSkiCollections(grid) {
    // Count segments per category for pre-allocation
    const counts = {
      aerialway: 0,
      road: 0,
    };
    DIFFICULTY_LEVELS.forEach(d => counts[d] = 0);

    grid.forEachWay((from, to, element) => {
      if (element.featureType === 'piste') {
        const diff = element.difficulty || 'unknown';
        counts[diff] = (counts[diff] || 0) + 1;
      } else if (element.featureType === 'aerialway') {
        counts.aerialway++;
      } else {
        counts.road++;
      }
    });

    // Create collections for each category
    this.collections = {};

    // Piste collections (one per difficulty)
    DIFFICULTY_LEVELS.forEach(difficulty => {
      if (counts[difficulty] > 0) {
        const col = new WireCollection(counts[difficulty], {
          width: this._lineWidth,
          allowColors: false,
          is3D: false
        });
        col.color = toRatioColor(config.getDifficultyColor(difficulty).toRgb());
        col.id = `${this.id}_piste_${difficulty}`;
        this.collections[difficulty] = col;
      }
    });

    // Aerialway collection
    if (counts.aerialway > 0) {
      const col = new WireCollection(counts.aerialway, {
        width: this._lineWidth,
        allowColors: false,
        is3D: false
      });
      col.color = toRatioColor(config.getAerialwayColor().toRgb());
      col.id = `${this.id}_aerialway`;
      this.collections.aerialway = col;
    }

    // Road collection (for any non-ski ways)
    if (counts.road > 0) {
      const col = new WireCollection(counts.road, {
        width: this._lineWidth,
        allowColors: false,
        is3D: false
      });
      col.color = toRatioColor(tinycolor(this._color).toRgb());
      col.id = `${this.id}_road`;
      this.collections.road = col;
    }

    // Populate collections with line segments
    grid.forEachWay((from, to, element) => {
      let targetCollection;
      if (element.featureType === 'piste') {
        const diff = element.difficulty || 'unknown';
        targetCollection = this.collections[diff];
      } else if (element.featureType === 'aerialway') {
        targetCollection = this.collections.aerialway;
      } else {
        targetCollection = this.collections.road;
      }

      if (targetCollection) {
        targetCollection.add({from, to});
      }
    });
  }

  destroy() {
    if (!this.scene) return;

    // Remove single collection (roads mode)
    if (this.lines) {
      this.scene.removeChild(this.lines);
    }

    // Remove multiple collections (ski mode)
    if (this.collections) {
      Object.values(this.collections).forEach(col => {
        this.scene.removeChild(col);
      });
    }
  }

  bindToScene(scene) {
    if (this.scene && (this.lines || this.collections)) {
      console.error('You seem to be adding this layer twice...')
    }

    this.scene = scene;
    if (!this.grid) return;

    this.buildLinesCollection();

    if (this.hidden) return;

    // Add single collection (roads mode)
    if (this.lines) {
      this.scene.appendChild(this.lines);
    }

    // Add multiple collections (ski mode)
    if (this.collections) {
      Object.values(this.collections).forEach(col => {
        this.scene.appendChild(col);
      });
    }
  }

  hide() {
    if (this.hidden) return;
    this.hidden = true;
    if (!this.scene || !this.grid) return;

    if (this.lines) {
      this.scene.removeChild(this.lines);
    }
    if (this.collections) {
      Object.values(this.collections).forEach(col => {
        this.scene.removeChild(col);
      });
    }
  }

  show() {
    if (!this.hidden) return;
    this.hidden = false;
    if (!this.scene || !this.grid) {
      console.log('Layer will be shown when grid is available');
      return;
    }

    if (this.lines) {
      this.scene.appendChild(this.lines);
    }
    if (this.collections) {
      Object.values(this.collections).forEach(col => {
        this.scene.appendChild(col);
      });
    }
  }

  _transferTransform() {
    const transform = [this.dx, this.dy, 0];

    if (this.lines) {
      this.lines.translate(transform);
      this.lines.updateWorldTransform(true);
    }

    if (this.collections) {
      Object.values(this.collections).forEach(col => {
        col.translate(transform);
        col.updateWorldTransform(true);
      });
    }

    if (this.scene) {
      this.scene.renderFrame(true);
    }
  }
}

function toRatioColor(c) {
  return {r: c.r/0xff, g: c.g/0xff, b: c.b/0xff, a: c.a}
}