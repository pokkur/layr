import {
  isComponentClass,
  isComponentInstance,
  validateComponentName,
  getComponentClassNameFromComponentInstanceName,
  getTypeOf,
  composeDescription
} from '@liaison/component';
import {hasOwnProperty, isPrototypeOf} from 'core-helpers';
import upperFirst from 'lodash/upperFirst';
import ow from 'ow';

import {isLayer} from './utilities';

export class Layer {
  constructor(components, options = {}) {
    ow(components, 'components', ow.optional.array);
    ow(options, 'options', ow.object.exactShape({name: ow.optional.string.nonEmpty}));

    const {name} = options;

    this._components = Object.create(null);

    if (name !== undefined) {
      this.setName(name);
    }

    if (components !== undefined) {
      for (const component of components) {
        this.registerComponent(component);
      }
    }
  }

  getName() {
    return this._name;
  }

  setName(name) {
    ow(name, ow.optional.string.nonEmpty);

    this._name = name;
  }

  unsetName() {
    this._name = undefined;
  }

  // === Components ===

  getComponent(name, options = {}) {
    ow(name, ow.string.nonEmpty);
    ow(
      options,
      'options',
      ow.object.exactShape({
        throwIfMissing: ow.optional.boolean,
        includePrototypes: ow.optional.boolean
      })
    );

    const {throwIfMissing = true, includePrototypes = false} = options;

    const isInstanceName =
      validateComponentName(name, {
        allowInstances: includePrototypes
      }) === 'componentInstanceName';

    const className = isInstanceName ? getComponentClassNameFromComponentInstanceName(name) : name;

    let Component = this._components[className];

    if (Component === undefined) {
      if (throwIfMissing) {
        throw new Error(
          `The component class '${className}' is not registered in the layer${composeDescription([
            this.describe()
          ])}`
        );
      }

      return undefined;
    }

    if (!hasOwnProperty(this._components, className)) {
      // Since the layer has been forked, the component must be forked as well
      Component = Component.fork();
      Component.setLayer(this);
      this._components[className] = Component;
    }

    return isInstanceName ? Component.prototype : Component;
  }

  registerComponent(Component) {
    if (isComponentInstance(Component)) {
      throw new Error(
        `Expected a component class, but received a component instance${composeDescription([
          this.describe(),
          Component.describeComponent({includeLayer: false})
        ])}`
      );
    }

    if (!isComponentClass(Component)) {
      throw new Error(
        `Expected a component class, but received a value of type '${getTypeOf(
          Component
        )}'${composeDescription([this.describe()])}`
      );
    }

    if (Component.hasLayer()) {
      throw new Error(
        `Cannot register ${Component.describeComponentType()} that is already registered${composeDescription(
          [
            this.describe({layerSuffix: 'requested'}),
            Component.describeComponent({layerSuffix: 'registered'})
          ]
        )}`
      );
    }

    const componentName = Component.getComponentName();

    const existingComponent = this._components[componentName];

    if (existingComponent !== undefined) {
      throw new Error(
        `${upperFirst(
          Component.describeComponentType()
        )} with the same name is already registered (${existingComponent.describeComponent()})`
      );
    }

    if (componentName in this) {
      throw new Error(
        `Cannot register ${Component.describeComponentType()} that has the same name as an existing property${composeDescription(
          [this.describe(), Component.describeComponent()]
        )}`
      );
    }

    Component.setLayer(this);

    this._components[componentName] = Component;

    Object.defineProperty(this, componentName, {
      get() {
        return this.getComponent(componentName);
      }
    });
  }

  getComponents(options = {}) {
    ow(
      options,
      'options',
      ow.object.exactShape({filter: ow.optional.function, includePrototypes: ow.optional.boolean})
    );

    const {filter, includePrototypes = false} = options;

    const layer = this;

    return {
      *[Symbol.iterator]() {
        // eslint-disable-next-line guard-for-in
        for (const name in layer._components) {
          const Component = layer.getComponent(name);

          if (filter !== undefined && !filter(Component)) {
            continue;
          }

          yield Component;

          if (includePrototypes) {
            yield Component.prototype;
          }
        }
      }
    };
  }

  // === Forking ===

  fork() {
    const forkedLayer = Object.create(this);

    forkedLayer._components = Object.create(this._components);

    return forkedLayer;
  }

  isForkOf(layer) {
    if (!isLayer(layer)) {
      throw new Error(`Expected a layer, but received a value of type '${getTypeOf(layer)}'`);
    }

    return isPrototypeOf(layer, this);
  }

  getGhost() {
    if (!this._ghost) {
      this._ghost = this.fork();
    }

    return this._ghost;
  }

  get ghost() {
    return this.getGhost();
  }

  // === Utilities ===

  static isLayer(object) {
    return isLayer(object);
  }

  describe(options = {}) {
    ow(options, 'options', ow.object.exactShape({layerSuffix: ow.optional.string}));

    let {layerSuffix = ''} = options;

    if (layerSuffix !== '') {
      layerSuffix = `${layerSuffix} `;
    }

    return this.getName() !== undefined ? `${layerSuffix}layer name: '${this.getName()}'` : '';
  }
}
