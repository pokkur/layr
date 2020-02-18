import {Component, isComponent, attribute, method} from '../../..';

describe('Component', () => {
  test('Creation', async () => {
    class Movie extends Component() {
      constructor() {
        super();
        this.title = '';
      }

      duration = undefined;
    }

    // Make sure there are no enumerable properties in the class
    expect(Object.keys(Movie)).toHaveLength(0);

    const movie = new Movie();

    expect(isComponent(movie)).toBe(true);
    expect(movie).toBeInstanceOf(Movie);

    expect(Object.keys(movie)).toHaveLength(2);
    expect(Object.keys(movie)).toContain('title');
    expect(Object.keys(movie)).toContain('duration');
    expect(movie.title).toBe('');
    expect(movie.duration).toBe(undefined);
  });

  test('Instantiation', async () => {
    class Movie extends Component() {
      constructor() {
        super();
        this.title = '';
      }

      duration = undefined;
    }

    const movie = Movie.instantiate();

    expect(isComponent(movie)).toBe(true);
    expect(movie).toBeInstanceOf(Movie);

    // Make sure the initializers have not be called
    expect(Object.keys(movie)).toHaveLength(0);
  });

  test('Checking that an object is a component', async () => {
    expect(isComponent(undefined)).toBe(false);
    expect(isComponent(null)).toBe(false);
    expect(isComponent(true)).toBe(false);
    expect(isComponent(1)).toBe(false);
    expect(isComponent({})).toBe(false);

    class Movie extends Component() {}

    expect(isComponent(Movie.prototype)).toBe(true);

    const movie = new Movie();

    expect(isComponent(movie)).toBe(true);
  });

  test('Naming', async () => {
    class Movie extends Component() {}

    expect(Movie.getName()).toBe('Movie');

    Movie.setName('Film');

    expect(Movie.getName()).toBe('Film');

    Movie.setName('MotionPicture');

    expect(Movie.getName()).toBe('MotionPicture');

    // Make sure there are no enumerable properties
    expect(Object.keys(Movie)).toHaveLength(0);

    expect(() => Movie.setName()).toThrow();
    expect(() => Movie.setName('')).toThrow();
    expect(() => Movie.setName(123)).toThrow();
    expect(() => Movie.setName('Component')).toThrow();

    const Anonymous = (() => class extends Component() {})();

    expect(() => Anonymous.getName()).toThrow("Component's name is missing");
    expect(Anonymous.getName({throwIfMissing: false})).toBeUndefined();
  });

  test('isNew mark', async () => {
    class Movie extends Component() {}

    const movie = new Movie();

    expect(movie.isNew()).toBe(true);

    movie.markAsNotNew();

    expect(movie.isNew()).toBe(false);

    movie.markAsNew();

    expect(movie.isNew()).toBe(true);
  });

  test('Forking', async () => {
    class Movie extends Component() {
      @attribute() static limit = 100;

      @attribute() title = '';
    }

    const ForkedMovie = Movie.fork();

    expect(ForkedMovie.limit).toBe(100);

    ForkedMovie.limit = 500;

    expect(ForkedMovie.limit).toBe(500);
    expect(Movie.limit).toBe(100);

    const movie = new Movie();

    const forkedMovie = movie.fork();

    expect(forkedMovie.title).toBe('');

    forkedMovie.title = 'Inception';

    expect(forkedMovie.title).toBe('Inception');
    expect(movie.title).toBe('');
  });

  test('Introspection', async () => {
    class Movie extends Component() {
      @attribute() static limit = 100;
      @attribute() static offset;
      @method() static find() {}

      @attribute() title = '';
      @attribute() country;
      @method() load() {}
    }

    const defaultTitle = Movie.prototype.getAttribute('title').getDefaultValueFunction();

    expect(typeof defaultTitle).toBe('function');

    expect(Movie.introspect()).toBeUndefined();

    Movie.getAttribute('limit').setExposure({get: true});

    expect(Movie.introspect()).toStrictEqual({
      name: 'Movie',
      properties: [{name: 'limit', type: 'attribute', value: 100, exposure: {get: true}}]
    });

    Movie.getAttribute('limit').setExposure();
    Movie.prototype.getAttribute('title').setExposure({get: true});

    expect(Movie.introspect()).toStrictEqual({
      name: 'Movie',
      prototype: {
        properties: [
          {name: 'title', type: 'attribute', default: defaultTitle, exposure: {get: true}}
        ]
      }
    });

    Movie.getAttribute('limit').setExposure({get: true});
    Movie.getAttribute('offset').setExposure({get: true});
    Movie.getMethod('find').setExposure({call: true});
    Movie.prototype.getAttribute('country').setExposure({get: true});
    Movie.prototype.getMethod('load').setExposure({call: true});

    expect(Movie.introspect()).toStrictEqual({
      name: 'Movie',
      properties: [
        {name: 'limit', type: 'attribute', value: 100, exposure: {get: true}},
        {name: 'offset', type: 'attribute', value: undefined, exposure: {get: true}},
        {name: 'find', type: 'method', exposure: {call: true}}
      ],
      prototype: {
        properties: [
          {name: 'title', type: 'attribute', default: defaultTitle, exposure: {get: true}},
          {name: 'country', type: 'attribute', exposure: {get: true}},
          {name: 'load', type: 'method', exposure: {call: true}}
        ]
      }
    });
  });
});
