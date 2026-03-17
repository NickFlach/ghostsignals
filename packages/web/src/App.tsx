import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Ghost, TrendingUp, Shield, DollarSign } from 'lucide-react';
import Dashboard from './components/Dashboard';
import MarketBrowser from './components/MarketBrowser';
import HedgeBasket from './components/HedgeBasket';
import ExpenseSetup from './components/ExpenseSetup';
import Navbar from './components/Navbar';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/markets" element={<MarketBrowser />} />
            <Route path="/basket" element={<HedgeBasket />} />
            <Route path="/expenses" element={<ExpenseSetup />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

function LandingPage() {
  return (
    <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="relative z-10 pb-8 sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
            <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
              <div className="sm:text-center lg:text-left">
                <h1 className="text-4xl tracking-tight font-extrabold text-white sm:text-5xl md:text-6xl">
                  <span className="block">Prediction markets</span>
                  <span className="block text-indigo-400">for hedging, not gambling</span>
                </h1>
                <p className="mt-3 text-base text-gray-300 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  Replace fiat currency with personalized risk baskets. Hedge your expenses with prediction markets that actually serve your financial interests.
                </p>
                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                  <div className="rounded-md shadow">
                    <a
                      href="/dashboard"
                      className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10"
                    >
                      Start Hedging
                    </a>
                  </div>
                  <div className="mt-3 sm:mt-0 sm:ml-3">
                    <a
                      href="/markets"
                      className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
                    >
                      Browse Markets
                    </a>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
          <div className="h-56 w-full sm:h-72 md:h-96 lg:w-full lg:h-full bg-gradient-to-br from-purple-600 to-indigo-800 flex items-center justify-center">
            <Ghost className="h-32 w-32 text-white opacity-50" />
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-indigo-600 font-semibold tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              A better way to handle money
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Stop gambling on random events. Start hedging against the costs that actually affect your life.
            </p>
          </div>

          <div className="mt-10">
            <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                  <Shield className="h-6 w-6" />
                </div>
                <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Personalized Hedging</p>
                <p className="mt-2 ml-16 text-base text-gray-500">
                  AI analyzes your spending patterns to create custom hedging baskets that protect against price increases in categories you actually spend on.
                </p>
              </div>

              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Market Prediction</p>
                <p className="mt-2 ml-16 text-base text-gray-500">
                  Advanced LMSR automated market makers provide efficient price discovery for food, housing, energy, and other essential goods.
                </p>
              </div>

              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                  <DollarSign className="h-6 w-6" />
                </div>
                <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Stability Score</p>
                <p className="mt-2 ml-16 text-base text-gray-500">
                  Track your hedging effectiveness with our stability score: S = 1 - σ(hedged)/σ(unhedged). Higher is better.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Section */}
      <div className="py-16 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-indigo-400 font-semibold tracking-wide uppercase">Architecture</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
              Built on solid foundations
            </p>
          </div>

          <div className="mt-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="text-center">
                <h3 className="text-lg font-medium text-indigo-400">Market Engine</h3>
                <p className="mt-2 text-gray-300">LMSR AMM + order book hybrid for efficient price discovery</p>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-indigo-400">Hedge Engine</h3>
                <p className="mt-2 text-gray-300">Portfolio optimization to minimize expense variance</p>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-indigo-400">Price Oracle</h3>
                <p className="mt-2 text-gray-300">Robust price feeds with outlier filtering</p>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-indigo-400">GhostVector</h3>
                <p className="mt-2 text-gray-300">Vector database for correlation discovery</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-indigo-700">
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            <span className="block">Ready to replace fiat currency?</span>
            <span className="block">Start hedging today.</span>
          </h2>
          <p className="mt-4 text-lg leading-6 text-indigo-200">
            Build the next generation of finance, not corposlop.
          </p>
          <a
            href="/dashboard"
            className="mt-8 w-full inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-indigo-50 sm:w-auto"
          >
            Get started
          </a>
        </div>
      </div>
    </div>
  );
}

export default App;
