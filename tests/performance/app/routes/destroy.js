import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service(),

  async model() {
    performance.mark('start-data-generation');
    const payload = await fetch('./fixtures/destroy.json').then((r) => r.json());

    performance.mark('start-push-payload');
    const parent = this.store.push(payload);
    performance.mark('start-destroy-records');
    const children = await parent.children;

    const childrenPromise = Promise.all(children.slice().map((child) => child.destroyRecord()));
    const parentPromise = parent.destroyRecord();

    await Promise.all([childrenPromise, parentPromise]);

    performance.mark('end-destroy-records');
  },
});
