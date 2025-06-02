import { get } from 'lodash';

export class SafeAccess {
  private data: any;

  constructor(data: any) {
    this.data = data;
  }

  get<T>(path: string, defaultValue?: T): T {
    return get(this.data, path, defaultValue);
  }

  has(path: string): boolean {
    return get(this.data, path) !== undefined;
  }

  static create(data: any): SafeAccess {
    return new SafeAccess(data);
  }
}

export const safe = (data: any) => SafeAccess.create(data); 