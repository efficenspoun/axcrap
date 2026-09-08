const STORAGE_KEYS = {
  REPORTS: 'clean_arcade_reports',
};

export const storage = {
  getReports() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.REPORTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Storage read error:', e);
      return [];
    }
  },

  submitReport(report) {
    try {
      const reports = this.getReports();
      const newReport = {
        ...report,
        id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString()
      };
      reports.push(newReport);
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
      return newReport;
    } catch (e) {
      console.warn('Report submission error:', e);
      return null;
    }
  }
};
