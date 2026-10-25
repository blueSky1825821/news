export function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || statusCode;
  const message = err.message || 'Internal Server Error';
  res.status(statusCode).json({ code, message, data: null });
}
