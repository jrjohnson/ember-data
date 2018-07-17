export default class ModelDataWrapper {
  constructor(store) {
    this.store = store;
    this._willUpdateManyArrays = false;
    this._pendingManyArrayUpdates = null;
  }

  _scheduleManyArrayUpdate(modelName, id, clientId, key) {
    let pending = (this._pendingManyArrayUpdates = this._pendingManyArrayUpdates || []);
    pending.push(modelName, id, clientId, key);

    if (this._willUpdateManyArrays === true) {
      return;
    }

    this._willUpdateManyArrays = true;
    let backburner = this.store._backburner;

    backburner.join(() => {
      backburner.schedule('syncRelationships', this, this._flushPendingManyArrayUpdates);
    });
  }

  _flushPendingManyArrayUpdates() {
    if (this._willUpdateManyArrays === false) {
      return;
    }

    let pending = this._pendingManyArrayUpdates;
    this._pendingManyArrayUpdates = [];
    this._willUpdateManyArrays = false;
    let store = this.store;

    for (let i = 0; i < pending.length; i += 4) {
      let modelName = pending[i];
      let id = pending[i + 1];
      let clientId = pending[i + 2];
      let key = pending[i + 3];
      let internalModel = store._getInternalModelForId(modelName, id, clientId);
      internalModel.notifyHasManyChanged(key);
    }
  }

  attributesDefinitionFor(modelName) {
    return this.store._attributesDefinitionFor(modelName);
  }

  relationshipsDefinitionFor(modelName) {
    return this.store._relationshipsDefinitionFor(modelName);
  }

  inverseForRelationship(modelName, key) {
    let modelClass = this.store.modelFor(modelName);
    return this.relationshipsDefinitionFor(modelName)[key]._inverseKey(this.store, modelClass);
  }

  // TODO Igor David cleanup
  inverseIsAsyncForRelationship(modelName, key) {
    let modelClass = this.store.modelFor(modelName);
    return this.relationshipsDefinitionFor(modelName)[key]._inverseIsAsync(this.store, modelClass);
  }

  notifyPropertyChange(modelName, id, clientId, key) {
    let internalModel = this.store._getInternalModelForId(modelName, id, clientId);
    internalModel.notifyPropertyChange(key);
  }

  notifyHasManyChanged(modelName, id, clientId, key) {
    this._scheduleManyArrayUpdate(modelName, id, clientId, key);
  }

  notifyBelongsToChanged(modelName, id, clientId, key) {
    let internalModel = this.store._getInternalModelForId(modelName, id, clientId);
    internalModel.notifyBelongsToChanged(key);
  }

  modelDataFor(modelName, id, clientId) {
    return this.store.modelDataFor(modelName, id, clientId);
  }

  setRecordId(modelName, id, clientId) {
    this.store.setRecordId(modelName, id, clientId);
  }

  isRecordInUse(modelName, id, clientId) {
    let internalModel = this.store._getInternalModelForId(modelName, id, clientId);
    if (!internalModel) {
      return false;
    }
    return internalModel.isRecordInUse();
  }

  disconnectRecord(modelName, id, clientId) {
    let internalModel = this.store._getInternalModelForId(modelName, id, clientId);
    if (internalModel) {
      internalModel.destroyFromModelData();
    }
  }
}
