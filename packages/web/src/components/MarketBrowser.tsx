import React, { useState } from 'react';
import { Search, Filter, TrendingUp, TrendingDown, Clock, MapPin } from 'lucide-react';

export default function MarketBrowser() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const categories = [
    { id: 'all', name: 'All Categories' },
    { id: 'food', name: 'Food & Groceries' },
    { id: 'housing', name: 'Housing' },
    { id: 'energy', name: 'Energy' },
    { id: 'healthcare', name: 'Healthcare' },
    { id: 'transport', name: 'Transportation' },
    { id: 'tech', name: 'Technology' },
    { id: 'materials', name: 'Materials' },
  ];

  const regions = [
    { id: 'all', name: 'All Regions' },
    { id: 'us-west', name: 'US West' },
    { id: 'us-east', name: 'US East' },
    { id: 'us-midwest', name: 'US Midwest' },
    { id: 'us-south', name: 'US South' },
    { id: 'global', name: 'Global' },
  ];

  // Mock market data
  const markets = [
    {
      id: 1,
      title: 'Food Price Index - US West Q2 2026',
      description: 'Prediction market for food price changes in western US states',
      category: 'food',
      region: 'us-west',
      currentPrice: 0.58,
      change24h: 0.03,
      volume24h: 125000,
      liquidity: 450000,
      outcomes: ['Increase >5%', 'Increase 0-5%', 'Decrease 0-5%', 'Decrease >5%'],
      resolutionDate: '2026-06-30'
    },
    {
      id: 2,
      title: 'Housing Cost Index - California Q2 2026',
      description: 'Rental and housing cost predictions for California markets',
      category: 'housing',
      region: 'us-west',
      currentPrice: 0.72,
      change24h: -0.05,
      volume24h: 89000,
      liquidity: 320000,
      outcomes: ['Increase >10%', 'Increase 5-10%', 'Increase 0-5%', 'Flat/Decrease'],
      resolutionDate: '2026-06-30'
    },
    {
      id: 3,
      title: 'Gasoline Price Index - National Q2 2026',
      description: 'National average gasoline price predictions',
      category: 'transport',
      region: 'global',
      currentPrice: 0.45,
      change24h: 0.08,
      volume24h: 67000,
      liquidity: 180000,
      outcomes: ['Above $4.50/gal', '$3.50-4.50/gal', 'Below $3.50/gal'],
      resolutionDate: '2026-06-30'
    },
    {
      id: 4,
      title: 'Healthcare CPI - US National Q2 2026',
      description: 'Healthcare cost index including insurance and services',
      category: 'healthcare',
      region: 'global',
      currentPrice: 0.63,
      change24h: 0.02,
      volume24h: 34000,
      liquidity: 95000,
      outcomes: ['Increase >8%', 'Increase 4-8%', 'Increase 0-4%'],
      resolutionDate: '2026-06-30'
    },
    {
      id: 5,
      title: 'Tech Device Price Index - Global Q2 2026',
      description: 'Consumer electronics and tech device price trends',
      category: 'tech',
      region: 'global',
      currentPrice: 0.38,
      change24h: -0.02,
      volume24h: 22000,
      liquidity: 75000,
      outcomes: ['Decrease >10%', 'Decrease 0-10%', 'Flat/Increase'],
      resolutionDate: '2026-06-30'
    }
  ];

  const filteredMarkets = markets.filter(market => {
    const matchesCategory = selectedCategory === 'all' || market.category === selectedCategory;
    const matchesRegion = selectedRegion === 'all' || market.region === selectedRegion;
    const matchesSearch = searchTerm === '' || 
      market.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      market.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesCategory && matchesRegion && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Market Browser</h1>
        <p className="text-gray-600">Discover and trade prediction markets for price indices</p>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search markets..."
            className="input pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <select
          className="input w-full"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          {categories.map(category => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        
        <select
          className="input w-full"
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
        >
          {regions.map(region => (
            <option key={region.id} value={region.id}>{region.name}</option>
          ))}
        </select>
      </div>

      {/* Market Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredMarkets.map(market => (
          <div key={market.id} className="card hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{market.title}</h3>
                <p className="text-sm text-gray-600 mb-3">{market.description}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 text-xs rounded-full ${
                  market.change24h > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {market.change24h > 0 ? '+' : ''}{(market.change24h * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-500 mb-4">
              <div className="flex items-center space-x-1">
                <MapPin className="h-4 w-4" />
                <span className="capitalize">{market.region.replace('-', ' ')}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>{new Date(market.resolutionDate).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-500">Current Price</div>
                <div className="text-lg font-semibold">${market.currentPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">24h Volume</div>
                <div className="text-lg font-semibold">${(market.volume24h / 1000).toFixed(0)}K</div>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2">Outcomes</div>
              <div className="flex flex-wrap gap-2">
                {market.outcomes.map((outcome, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {outcome}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-500">
                Liquidity: ${(market.liquidity / 1000).toFixed(0)}K
              </div>
              <div className="space-x-2">
                <button className="btn-secondary text-sm">View Details</button>
                <button className="btn-primary text-sm">Trade</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredMarkets.length === 0 && (
        <div className="text-center py-12">
          <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No markets found</h3>
          <p className="text-gray-500">Try adjusting your search filters</p>
        </div>
      )}
    </div>
  );
}