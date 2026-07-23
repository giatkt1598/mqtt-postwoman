import { NextFunction, Request, RequestHandler, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";

type AsyncRequestHandler<P extends ParamsDictionary> = (req: Request<P>, res: Response, next: NextFunction) => unknown;

export function asyncHandler<P extends ParamsDictionary = ParamsDictionary>(handler: AsyncRequestHandler<P>): RequestHandler<P> {
  return (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };
}
