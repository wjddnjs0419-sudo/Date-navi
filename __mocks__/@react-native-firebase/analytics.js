const getAnalytics = jest.fn(() => 'firebase-analytics');
const logEvent = jest.fn();
const logScreenView = jest.fn();

module.exports = { getAnalytics, logEvent, logScreenView };
