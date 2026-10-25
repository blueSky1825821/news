export function responseWrapper(req, res, next) {
  res.sendJson = (code, message, data = null) => {
    res.json({ code, message, data });
  };
  next();
}
