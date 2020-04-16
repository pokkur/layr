import {isLayer} from '@liaison/layer';
import {Component, isComponentClass} from '@liaison/component';
import Koa from 'koa';
import jsonError from 'koa-json-error';
import cors from '@koa/cors';
import body from 'co-body';
import isEqual from 'lodash/isEqual';

import {LayerHTTPClient} from '../../..';

const SERVER_PORT = 4444;

describe('LayerHTTPClient', () => {
  let server;

  beforeAll(() => {
    const koa = new Koa();

    koa.use(jsonError());

    koa.use(cors({maxAge: 900})); // 15 minutes

    koa.use(async function(ctx) {
      const {query, version: clientVersion} = await body.json(ctx.req);

      const serverVersion = 1;

      if (clientVersion !== serverVersion) {
        throw Object.assign(
          new Error(
            `The component client version (${clientVersion}) doesn't match the component server version (${serverVersion})`
          ),
          {code: 'COMPONENT_CLIENT_VERSION_DOES_NOT_MATCH_COMPONENT_SERVER_VERSION', expose: true}
        );
      }

      if (isEqual(query, {'introspect=>': {'()': []}})) {
        ctx.body = {
          result: {
            name: 'backend',
            components: [
              {
                name: 'Movie',
                type: 'Component',
                properties: [{name: 'limit', type: 'attribute', value: 100, exposure: {get: true}}]
              }
            ]
          }
        };
      } else {
        throw new Error(`Received an unknown query: ${JSON.stringify(query)}`);
      }
    });

    return new Promise(resolve => {
      server = koa.listen(SERVER_PORT, resolve);
    });
  });

  afterAll(() => {
    if (server === undefined) {
      return;
    }

    return new Promise(resolve => {
      server.close(() => {
        server = undefined;
        resolve();
      });
    });
  });

  test('Getting layers', async () => {
    let client = new LayerHTTPClient(`http://localhost:${SERVER_PORT}`);

    await expect(client.getLayer()).rejects.toThrow(
      "The component client version (undefined) doesn't match the component server version (1)"
    );

    client = new LayerHTTPClient(`http://localhost:${SERVER_PORT}`, {
      version: 1,
      baseComponents: [Component]
    });

    const layer = await client.getLayer();

    expect(isLayer(layer)).toBe(true);
    expect(layer.getName()).toBe('backend');

    const Movie = layer.getComponent('Movie');

    expect(isComponentClass(Movie)).toBe(true);
    expect(Movie.getComponentName()).toBe('Movie');
    expect(Movie.limit).toBe(100);

    const attribute = Movie.getAttribute('limit');

    expect(attribute.getValue()).toBe(100);
    expect(attribute.getExposure()).toEqual({get: true});
  });
});
