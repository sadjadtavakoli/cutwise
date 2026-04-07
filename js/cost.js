export function stockCost(stockItem) {
  if (stockItem.type === 'hardwood') {
    const boardFeet = (stockItem.length * stockItem.width * stockItem.thickness) / 144;
    return stockItem.price * boardFeet;
  }
  // Dimensional and sheet are priced per piece/sheet
  return stockItem.price;
}
