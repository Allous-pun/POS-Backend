const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
    statusCode
  });
};

const errorResponse = (res, message = 'Internal Server Error', statusCode = 500) => {
  res.status(statusCode).json({
    success: false,
    message,
    statusCode
  });
};

module.exports = {
  successResponse,
  errorResponse
};