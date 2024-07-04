import { Quadtree, Bounds, Point, Range } from './quadtree';

describe('Quadtree', () => {
  let quadtree: Quadtree;
  const bounds: Bounds = { xMin: 0, xMax: 20, yMin: 0, yMax: 20 };
  const capacity = 4;

  beforeEach(() => {
    quadtree = new Quadtree(bounds, capacity);
  });

  it('should insert a range within bounds', () => {
    const range: Range = {
      name: 'test',
      bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
      action: () => { console.log('test action'); }
    };
    const result = quadtree.insert(range);
    expect(result).toBe(true);
  });

  it('should not insert a range outside bounds', () => {
    const range: Range = {
      name: 'test',
      bounds: { xMin: 21, xMax: 25, yMin: 21, yMax: 25 },
      action: () => { console.log('test action'); }
    };
    const result = quadtree.insert(range);
    expect(result).toBe(false);
  });

  it('should query ranges containing a point', () => {
    const ranges: Range[] = [
      {
        name: 'range1',
        bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
        action: () => { console.log('range1 action'); }
      },
      {
        name: 'range2',
        bounds: { xMin: 10, xMax: 15, yMin: 10, yMax: 15 },
        action: () => { console.log('range2 action'); }
      }
    ];
    for (const range of ranges) {
      quadtree.insert(range);
    }
    const point: Point = { x: 3, y: 3 };
    const found = quadtree.query(point);
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('range1');
  });

  it('should return empty array for points not within any range', () => {
    const ranges: Range[] = [
      {
        name: 'range1',
        bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
        action: () => { console.log('range1 action'); }
      },
      {
        name: 'range2',
        bounds: { xMin: 10, xMax: 15, yMin: 10, yMax: 15 },
        action: () => { console.log('range2 action'); }
      }
    ];
    for (const range of ranges) {
      quadtree.insert(range);
    }
    const point: Point = { x: 6, y: 6 };
    const found = quadtree.query(point);
    expect(found.length).toBe(0);
  });

  it('should cache query results', () => {
    const range: Range = {
      name: 'range1',
      bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
      action: () => { console.log('range1 action'); }
    };
    quadtree.insert(range);
    const point: Point = { x: 3, y: 3 };
    const found1 = quadtree.query(point);
    const found2 = quadtree.query(point);
    expect(found1).toBe(found2); // Should be the same reference due to caching
  });

  it('should query ranges within a bounding box', () => {
    const ranges: Range[] = [
      {
        name: 'range1',
        bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
        action: () => { console.log('range1 action'); }
      },
      {
        name: 'range2',
        bounds: { xMin: 10, xMax: 15, yMin: 10, yMax: 15 },
        action: () => { console.log('range2 action'); }
      },
      {
        name: 'range3',
        bounds: { xMin: 14, xMax: 16, yMin: 14, yMax: 16 },
        action: () => { console.log('range3 action'); }
      }
    ];
    for (const range of ranges) {
      quadtree.insert(range);
    }
    const boundingBox: Bounds = { xMin: 8, xMax: 18, yMin: 8, yMax: 18 };
    const found = quadtree.queryRange(boundingBox);
    expect(found.length).toBe(2);
    expect(found.some(r => r.name === 'range2')).toBe(true);
    expect(found.some(r => r.name === 'range3')).toBe(true);
  });

  it('should return empty array for bounding boxes not within any range', () => {
    const ranges: Range[] = [
      {
        name: 'range1',
        bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
        action: () => { console.log('range1 action'); }
      },
      {
        name: 'range2',
        bounds: { xMin: 10, xMax: 15, yMin: 10, yMax: 15 },
        action: () => { console.log('range2 action'); }
      }
    ];
    for (const range of ranges) {
      quadtree.insert(range);
    }
    const boundingBox: Bounds = { xMin: 16, xMax: 18, yMin: 16, yMax: 18 };
    const found = quadtree.queryRange(boundingBox);
    expect(found.length).toBe(0);
  });
});
