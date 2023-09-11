import EmberObject from '@ember/object';

export default class ApplicationMockAdapter extends EmberObject {
  findAll() {
    return fetch('./fixtures/relationship-materialization-simple.json').then((response) => response.json());
  }
  shouldReloadAll() {
    return false;
  }
  shouldBackgroundReloadAll() {
    return false;
  }
  deleteRecord = function () {
    return Promise.resolve();
  };
}
