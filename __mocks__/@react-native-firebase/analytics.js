const getAnalytics = jest.fn(() => 'firebase-analytics');
const logEvent = jest.fn();

module.exports = { getAnalytics, logEvent };
