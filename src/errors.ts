// Simple error classes for flongo

export class Error404 extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "Error404";
  }
}

export class Error400 extends Error {
  constructor(message = "Bad request") {
    super(message);
    this.name = "Error400";
  }
}