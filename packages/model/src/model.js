import {Observable} from '@liaison/observable';
import {Registerable, Serializable} from '@liaison/layer';
import {hasOwnProperty, getInheritedPropertyDescriptor} from '@liaison/util';
import ow from 'ow';
import isEmpty from 'lodash/isEmpty';
import {inspect} from 'util';

import {Field, isField} from './field';
import {FieldMask} from './field-mask';
import {Method, isMethod} from './method';

export class Model extends Observable(Serializable(Registerable())) {
  constructor(object = {}, {isDeserializing} = {}) {
    super(object, {isDeserializing});

    if (isDeserializing) {
      return;
    }

    for (const field of this.$getFields()) {
      const name = field.getName();
      if (hasOwnProperty(object, name)) {
        const value = object[name];
        field.createValue(value);
      } else {
        const defaultValue = field.getDefaultValue();
        field.setValue(defaultValue);
      }
    }
  }

  $assign(object) {
    if (object === undefined) {
      // NOOP
    } else if (Model.$isModel(object)) {
      this.__assignOther(object);
    } else if (typeof object === 'object') {
      this.__assignObject(object);
    } else {
      throw new Error(
        `Type mismatch (expected: 'Model' or 'Object', received: '${typeof object}')`
      );
    }
  }

  __assignObject(object) {
    for (const [name, value] of Object.entries(object)) {
      if (this.$hasField(name)) {
        const field = this.$getField(name);
        field.createValue(value);
      }
    }
  }

  __assignOther(other) {
    for (const otherField of other.$getActiveFields()) {
      const name = otherField.getName();
      if (this.$hasField(name)) {
        const field = this.$getField(name);
        const value = otherField.getValue();
        field.setValue(value);
      }
    }
  }

  $clone() {
    return this.constructor.$deserialize(this.$serialize());
  }

  // === Serialization ===

  $serialize({target, fields} = {}) {
    const targetIsLower = () => {
      if (target === undefined) {
        return false;
      }

      const layer = this.$getLayer({throwIfNotFound: false});
      const parentLayer = layer?.getParent({throwIfNotFound: false});
      return !(target === layer?.getId() || target === parentLayer?.getId());
    };

    const rootFieldMask = targetIsLower() ?
      this.$createFieldMaskForExposedFields(fields) :
      this.$createFieldMask(fields);

    const serializedFields = {};

    for (const field of this.$getActiveFields()) {
      const name = field.getName();

      const fieldMask = rootFieldMask.get(name);
      if (!fieldMask) {
        continue;
      }

      const value = field.serializeValue({target, fields: fieldMask});

      if (value !== undefined) {
        serializedFields[name] = value;
      }
    }

    return {...super.$serialize(), ...serializedFields};
  }

  $deserialize(object = {}, {source, fields} = {}) {
    super.$deserialize(object);

    const rootFieldMask = this.$createFieldMask(fields);
    let rootMissingFields;
    const isNew = this.$isNew();

    for (const name of this.$getFieldNames()) {
      const fieldMask = rootFieldMask.get(name);
      if (!fieldMask) {
        continue;
      }

      if (hasOwnProperty(object, name)) {
        const field = this.$getField(name);
        const value = object[name];
        const {missingFields} = field.deserializeValue(value, {source, fields: fieldMask});
        if (missingFields) {
          if (!rootMissingFields) {
            rootMissingFields = new FieldMask();
          }
          rootMissingFields.set(name, missingFields);
        }
      } else if (isNew) {
        const field = this.$getField(name);
        const defaultValue = field.getDefaultValue();
        field.setValue(defaultValue);
      } else {
        if (!rootMissingFields) {
          rootMissingFields = new FieldMask();
        }
        rootMissingFields.set(name, fieldMask);
      }
    }

    return {missingFields: rootMissingFields};
  }

  static $getInstance(object, previousInstance) {
    if (previousInstance?.constructor === this) {
      return previousInstance;
    }
  }

  // === Properties ===

  $getProperty(name, {throwIfNotFound = true} = {}) {
    const properties = this.__getProperties();

    let property = properties[name];

    if (!property) {
      if (throwIfNotFound) {
        throw new Error(
          `Property not found (name: '${name}'), model: ${this.constructor.$getRegisteredName()}`
        );
      }
      return undefined;
    }

    if (!hasOwnProperty(properties, name)) {
      property = property.fork(this);
      properties[name] = property;
    }

    return property;
  }

  $setProperty(constructor, name, options = {}) {
    if (this.$hasProperty(name)) {
      const existingProperty = this.$getProperty(name);
      options = {...existingProperty.getOptions(), ...options};
    }

    const properties = this.__getProperties();
    const property = new constructor(this, name, options);
    properties[name] = property;

    return property;
  }

  $hasProperty(name) {
    return this.$getProperty(name, {throwIfNotFound: false}) !== undefined;
  }

  $getProperties({filter} = {}) {
    const model = this;

    return {
      * [Symbol.iterator]() {
        for (const name of model.$getPropertyNames()) {
          const property = model.$getProperty(name);

          if (filter && !filter(property)) {
            continue;
          }

          yield property;
        }
      }
    };
  }

  $getPropertyNames() {
    const properties = this.__properties;

    return {
      * [Symbol.iterator]() {
        if (properties) {
          // eslint-disable-next-line guard-for-in
          for (const name in properties) {
            yield name;
          }
        }
      }
    };
  }

  __getProperties() {
    if (!this.__properties) {
      this.__properties = Object.create(null);
    } else if (!hasOwnProperty(this, '__properties')) {
      this.__properties = Object.create(this.__properties);
    }

    return this.__properties;
  }

  // === Fields ===

  static $Field = Field;

  $getField(name, {throwIfNotFound = true} = {}) {
    const property = this.$getProperty(name, {throwIfNotFound: false});

    if (!property) {
      if (throwIfNotFound) {
        throw new Error(
          `Field not found (name: '${name}'), model: ${this.constructor.$getRegisteredName()}`
        );
      }
      return undefined;
    }

    if (!isField(property)) {
      throw new Error(
        `Found property is not a field (name: '${name}'), model: ${this.constructor.$getRegisteredName()}`
      );
    }

    return property;
  }

  $setField(name, options = {}) {
    if (this.$hasProperty(name)) {
      const existingField = this.$getField(name);

      const type = options.type;
      if (type !== undefined && type !== existingField.getType()) {
        throw new Error(`Cannot change the type of an existing field (name: '${name}')`);
      }
    }

    return this.$setProperty(this.constructor.$Field, name, options);
  }

  $hasField(name) {
    return this.$getField(name, {throwIfNotFound: false}) !== undefined;
  }

  $getFields({filter: otherFilter} = {}) {
    const filter = function (property) {
      if (!isField(property)) {
        return false;
      }

      if (otherFilter) {
        return otherFilter(property);
      }

      return true;
    };

    return this.$getProperties({filter});
  }

  $getFieldNames() {
    const fields = this.$getFields();

    return {
      * [Symbol.iterator]() {
        // eslint-disable-next-line guard-for-in
        for (const field of fields) {
          yield field.getName();
        }
      }
    };
  }

  $getFieldValues({fields, filter} = {}) {
    const rootFieldMask = this.$createFieldMask(fields, {includeReferencedEntities: true});

    const model = this;

    return {
      * [Symbol.iterator]() {
        for (const field of model.$getActiveFields({filter})) {
          const name = field.getName();

          const fieldMask = rootFieldMask.get(name);
          if (!fieldMask) {
            continue;
          }

          for (const value of field.getValues()) {
            yield {value, fields: fieldMask};
          }
        }
      }
    };
  }

  $getActiveFields({filter: otherFilter} = {}) {
    const filter = function (field) {
      if (!field.isActive()) {
        return false;
      }

      if (otherFilter) {
        return otherFilter(field);
      }

      return true;
    };

    return this.$getFields({filter});
  }

  // === Field masks ===

  $createFieldMask(fields = true, {filter, includeReferencedEntities = false} = {}) {
    // TODO: Consider memoizing

    if (FieldMask.isFieldMask(fields)) {
      fields = fields.serialize();
    }

    fields = this.__createFieldMask(fields, {
      filter,
      includeReferencedEntities,
      _typeStack: new Set()
    });

    return new FieldMask(fields);
  }

  __createFieldMask(rootFieldMask, {filter, includeReferencedEntities, _typeStack}) {
    ow(rootFieldMask, 'fields', ow.any(ow.boolean, ow.object));

    const normalizedFieldMask = {};

    for (const field of this.$getFields({filter})) {
      const type = field.getScalar().getType();
      if (_typeStack.has(type)) {
        continue; // Avoid looping indefinitely when a circular type is encountered
      }

      const name = field.getName();

      const fieldMask = typeof rootFieldMask === 'object' ? rootFieldMask[name] : rootFieldMask;
      if (!fieldMask) {
        continue;
      }

      _typeStack.add(type);
      normalizedFieldMask[name] = field._createFieldMask(fieldMask, {
        filter,
        includeReferencedEntities,
        _typeStack
      });
      _typeStack.delete(type);
    }

    return normalizedFieldMask;
  }

  $createFieldMaskForActiveFields() {
    return this.$createFieldMask(true, {
      filter(field) {
        return field.isActive();
      }
    });
  }

  $createFieldMaskForExposedFields(fields = true) {
    return this.$createFieldMask(fields, {
      filter(field) {
        return field.isExposed();
      }
    });
  }

  // === Validation ===

  $validate({fields} = {}) {
    const failedValidators = this.$getFailedValidators({fields});
    if (failedValidators) {
      const error = new Error(
        `Model validation failed (model: '${this.constructor.$getRegisteredName()}', failedValidators: ${JSON.stringify(
          failedValidators
        )})`
      );
      error.failedValidators = failedValidators;
      throw error;
    }
  }

  $isValid({fields} = {}) {
    return this.$getFailedValidators({fields}) === undefined;
  }

  $getFailedValidators({fields} = {}) {
    const rootFieldMask = this.$createFieldMask(fields);

    let result;

    for (const field of this.$getActiveFields()) {
      const name = field.getName();

      const fieldMask = rootFieldMask.get(name);
      if (!fieldMask) {
        continue;
      }

      const failedValidators = field.getFailedValidators({fields: fieldMask});
      if (!isEmpty(failedValidators)) {
        if (!result) {
          result = {};
        }
        result[name] = failedValidators;
      }
    }

    return result;
  }

  // === Methods ===

  static $Method = Method;

  $getMethod(name, {throwIfNotFound = true} = {}) {
    const property = this.$getProperty(name, {throwIfNotFound: false});

    if (!property) {
      if (throwIfNotFound) {
        throw new Error(
          `Method not found (name: '${name}'), model: ${this.constructor.$getRegisteredName()}`
        );
      }
      return undefined;
    }

    if (!isMethod(property)) {
      throw new Error(
        `Found property is not a method (name: '${name}'), model: ${this.constructor.$getRegisteredName()}`
      );
    }

    return property;
  }

  $setMethod(name, options = {}) {
    if (this.$hasProperty(name)) {
      this.$getMethod(name); // Make sure the property is a method
    }

    return this.$setProperty(this.constructor.$Method, name, options);
  }

  $hasMethod(name) {
    return this.$getMethod(name, {throwIfNotFound: false}) !== undefined;
  }

  $getMethods({filter: otherFilter} = {}) {
    const filter = function (property) {
      if (!isMethod(property)) {
        return false;
      }

      if (otherFilter) {
        return otherFilter(property);
      }

      return true;
    };

    return this.$getProperties({filter});
  }

  $getMethodNames() {
    const methods = this.$getMethods();

    return {
      * [Symbol.iterator]() {
        // eslint-disable-next-line guard-for-in
        for (const method of methods) {
          yield method.getName();
        }
      }
    };
  }

  // === Utilities ===

  get super() {
    const handler = {
      // TODO: Consider implementing more handlers

      get(target, name) {
        const prototype = Object.getPrototypeOf(target.constructor.prototype);

        let value = prototype[name];

        if (typeof value === 'function') {
          value = value.bind(target);
        }

        return value;
      }
    };

    return new Proxy(this, handler);
  }

  static $isModel(object) {
    return isModel(object);
  }

  [inspect.custom]() {
    const object = {};
    for (const field of this.$getActiveFields()) {
      const name = field.getName();
      const value = field.getValue();
      if (value !== undefined) {
        object[name] = value;
      }
    }
    return object;
  }
}

// === Utilities ===

export function isModel(object) {
  return typeof object?.constructor?.$isModel === 'function';
}

// === Decorators ===

export function field(type, options = {}) {
  // Let's make 'type' optional to better support field overriding
  if (typeof type === 'string') {
    options = {...options, type};
  } else {
    options = type;
  }

  return function (target, name, descriptor) {
    if (!isModel(target)) {
      throw new Error(`@field() target must be a model`);
    }

    if (!(name && descriptor)) {
      throw new Error(`@field() must be used to decorate attributes`);
    }

    if (descriptor.initializer) {
      options = {...options, default: descriptor.initializer};
    }

    target.$setField(name, options);

    return {
      configurable: false,
      enumerable: false,
      get() {
        const field = this.$getField(name);
        return field.getValue();
      },
      set(value) {
        const field = this.$getField(name);
        return field.setValue(value);
      }
    };
  };
}

export function method(options = {}) {
  return function (target, name, descriptor) {
    if (!(isModel(target) || isModel(target.prototype))) {
      throw new Error(`@method() target must be a model`);
    }

    if (!(name && descriptor)) {
      throw new Error(`@method() must be used to decorate methods`);
    }

    if (descriptor.initializer !== undefined) {
      // @method() is used on an method defined in a parent class
      // Examples: `@method() $get;` or `@method() static $get;`
      descriptor = getInheritedPropertyDescriptor(target, name);
      if (descriptor === undefined) {
        throw new Error(`Cannot use @method() on an undefined property (name: '${name}')`);
      }
    }

    target.$setMethod(name, options);

    return descriptor;
  };
}
