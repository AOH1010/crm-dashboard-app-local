export class DataConnector {
  async initializeRuntimeState() {
    return this;
  }

  ensureReady() {
    throw new Error("DataConnector.ensureReady() is not implemented.");
  }

  openDatabase() {
    throw new Error("DataConnector.openDatabase() is not implemented.");
  }

  resolveTable(_canonicalName) {
    throw new Error("DataConnector.resolveTable() is not implemented.");
  }

  describeDomain(_domainId) {
    throw new Error("DataConnector.describeDomain() is not implemented.");
  }

  getDomainsForView(_viewId) {
    throw new Error("DataConnector.getDomainsForView() is not implemented.");
  }

  buildSchemaSummary(_viewId) {
    throw new Error("DataConnector.buildSchemaSummary() is not implemented.");
  }

  assertSafeSql(_sql, _options) {
    throw new Error("DataConnector.assertSafeSql() is not implemented.");
  }

  runReadQuery(_params) {
    throw new Error("DataConnector.runReadQuery() is not implemented.");
  }

  async runReadQueryAsync(params) {
    return this.runReadQuery(params);
  }

  healthCheck() {
    throw new Error("DataConnector.healthCheck() is not implemented.");
  }

  getLatestOrderDateKey() {
    throw new Error("DataConnector.getLatestOrderDateKey() is not implemented.");
  }

  getLatestOrderYear() {
    throw new Error("DataConnector.getLatestOrderYear() is not implemented.");
  }

  getLatestMonthKey() {
    throw new Error("DataConnector.getLatestMonthKey() is not implemented.");
  }

  getLatestOperationsMonthEndKey() {
    throw new Error("DataConnector.getLatestOperationsMonthEndKey() is not implemented.");
  }

  getSellerNames() {
    throw new Error("DataConnector.getSellerNames() is not implemented.");
  }

  detectSellerCandidates(_question) {
    throw new Error("DataConnector.detectSellerCandidates() is not implemented.");
  }

  detectSellerName(_question) {
    throw new Error("DataConnector.detectSellerName() is not implemented.");
  }
}
