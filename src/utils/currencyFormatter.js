const Setting = require('../models/Setting');

class CurrencyFormatter {
  static async format(amount) {
    try {
      const settings = await Setting.getSettings();
      const currency = settings.currency;
      
      let formattedAmount = parseFloat(amount).toFixed(currency.decimals);
      
      // Add thousand separators
      formattedAmount = formattedAmount.replace(/\d(?=(\d{3})+\.)/g, '$&,');
      
      // Replace decimal separator if needed
      if (currency.decimalSeparator !== '.') {
        formattedAmount = formattedAmount.replace('.', currency.decimalSeparator);
      }
      
      // Add currency symbol
      if (currency.position === 'before') {
        return `${currency.symbol} ${formattedAmount}`;
      } else {
        return `${formattedAmount} ${currency.symbol}`;
      }
    } catch (error) {
      // Fallback formatting
      return `KSh ${parseFloat(amount).toFixed(2)}`;
    }
  }

  static async formatWithoutSymbol(amount) {
    try {
      const settings = await Setting.getSettings();
      const currency = settings.currency;
      
      let formattedAmount = parseFloat(amount).toFixed(currency.decimals);
      
      // Add thousand separators
      formattedAmount = formattedAmount.replace(/\d(?=(\d{3})+\.)/g, '$&,');
      
      // Replace decimal separator if needed
      if (currency.decimalSeparator !== '.') {
        formattedAmount = formattedAmount.replace('.', currency.decimalSeparator);
      }
      
      return formattedAmount;
    } catch (error) {
      // Fallback formatting
      return parseFloat(amount).toFixed(2);
    }
  }

  static async getCurrencyInfo() {
    try {
      const settings = await Setting.getSettings();
      return settings.currency;
    } catch (error) {
      return {
        code: 'KES',
        symbol: 'KSh',
        position: 'before',
        decimals: 2,
        thousandSeparator: ',',
        decimalSeparator: '.'
      };
    }
  }
}

module.exports = CurrencyFormatter;