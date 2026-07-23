import { AppServices } from "../services/app-services";

export class CollectionController {
  constructor(private readonly service: AppServices) {}
  list = () => this.service.collections.list();
  save = (input: unknown) => this.service.collections.save(input);
  remove = (id: string) => this.service.collections.delete(id);
  reorder = (ids: string[]) => this.service.collections.reorder(ids);
  duplicate = (id: string) => this.service.collections.duplicate(id);
}

export class RequestController {
  constructor(private readonly service: AppServices) {}
  list = (collectionId?: string) => this.service.requests.list(collectionId);
  get = (id: string) => this.service.requests.get(id);
  save = (input: unknown) => this.service.requests.save(input);
  remove = (id: string) => this.service.requests.delete(id);
  reorder = (collectionId: string, ids: string[]) => this.service.requests.reorder(collectionId, ids);
}

export class VariableController {
  constructor(private readonly service: AppServices) {}
  listCollections = () => this.service.variables.collections();
  saveCollection = (input: unknown) => this.service.variables.saveCollection(input);
  removeCollection = (id: string) => this.service.variables.deleteCollection(id);
  list = (id?: string) => this.service.variables.list(id);
  get = (id: string) => this.service.variables.get(id);
  save = (input: unknown) => this.service.variables.save(input);
  remove = (id: string) => this.service.variables.delete(id);
  reorder = (id: string, ids: string[]) => this.service.variables.reorder(id, ids);
}

export class PublishController {
  constructor(private readonly service: AppServices) {}
  publish = (input: any) => this.service.publish(input);
  batch = (input: any) => this.service.batchPublish(input);
  resolve = (template: string, variableCollectionId: string | null | undefined, variables: Record<string, unknown>) => this.service.resolve(template, variableCollectionId, variables);
}

export function createControllers(service: AppServices) {
  return {
    collections: new CollectionController(service),
    requests: new RequestController(service),
    variables: new VariableController(service),
    publish: new PublishController(service),
  };
}
