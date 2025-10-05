import { useState, useEffect } from 'react';
import parseLLMJson from './utils/jsonParser';

interface WorkflowComponent {
  id: string;
  name: string;
  type: 'agent' | 'app' | 'knowledge_base' | 'token_volume' | 'rai_runs' | 'api_calls';
  quantity: number;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  cost?: number;
  businessValue?: string;
  roiMultiplier?: number;
}

interface CostAnalysis {
  totalCredits: number;
  usdEquivalent: number;
  breakdown: {
    agents: number;
    apps: number;
    knowledgeBases: number;
    tokenVolumes: number;
    raiRuns: number;
    apiCalls: number;
  };
  raiCost: number;
  yearlyProjection?: number;
  growthScenario?: number;
  roi?: number;
  savings?: number;
}

interface AgentResponse {
  result: {
    cost_analysis?: CostAnalysis;
    summary?: {
      text: string[];
      export: any;
    };
  };
  confidence?: number;
  metadata?: {
    processing_time: string;
    timestamp: string;
  };
}

export default function App() {
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [components, setComponents] = useState<WorkflowComponent[]>([
    {
      id: '1',
      name: 'AI Agent',
      type: 'agent',
      quantity: 1,
      frequency: 'daily',
      businessValue: 'Automates customer service inquiries',
      roiMultiplier: 3.2
    }
  ]);
  const [costAnalysis, setCostAnalysis] = useState<CostAnalysis | null>(null);
  const [notification, setNotification] = useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'monthly' | 'yearly' | '3-year'>('monthly');
  const [growthRate, setGrowthRate] = useState<number>(15); // 15% monthly growth
  const [showExplanations, setShowExplanations] = useState<boolean>(true);

  const API_KEY = 'sk-default-obhGvAo6gG9YT9tu6ChjyXLqnw7TxSGY';
  const CREDITS_AGENT_ID = '68e27df21d634c8310980f7d';
  const SUMMARY_AGENT_ID = '68e27e02010a31eba9891407';

  const generateRandomId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  const callAgent = async (agentId: string, message: string): Promise<AgentResponse> => {
    try {
      const response = await fetch('https://agent-prod.studio.lyzr.ai/v3/inference/chat/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({
          user_id: `user${generateRandomId()}@test.com`,
          agent_id: agentId,
          session_id: `${agentId}-${generateRandomId()}`,
          message: message
        })
      });

      const data = await response.text();
      return parseLLMJson(data) as AgentResponse;
    } catch (error) {
      throw new Error(`Agent call failed: ${error}`);
    }
  };

  const calculateCosts = async () => {
    setIsLoading(true);
    setNotification('');

    try {
      const message = JSON.stringify({
        components: components,
        user_role: getUserRole(),
        calculation_type: isAdvanced ? 'detailed' : 'simple'
      });

      const creditsResponse = await callAgent(CREDITS_AGENT_ID, message);

      if (creditsResponse.result?.cost_analysis) {
        setCostAnalysis(creditsResponse.result.cost_analysis);

        // Get summary if in advanced mode
        if (isAdvanced) {
          const summaryMessage = JSON.stringify({
            cost_data: creditsResponse.result.cost_analysis,
            format: 'both'
          });

          await callAgent(SUMMARY_AGENT_ID, summaryMessage);
        }
      }
    } catch (error) {
      setNotification('Error calculating costs. Please check your inputs.');
      console.error('Cost calculation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserRole = () => {
    if (components.some(c => c.type === 'agent')) return 'developer';
    if (components.some(c => c.type === 'rai_runs')) return 'compliance_lead';
    if (components.some(c => c.type === 'token_volume')) return 'finance_admin';
    return 'product_manager';
  };

  const addComponent = () => {
    const newComponent: WorkflowComponent = {
      id: generateRandomId(),
      name: 'New Component',
      type: 'agent',
      quantity: 1,
      frequency: 'daily'
    };
    setComponents([...components, newComponent]);
  };

  const updateComponent = (id: string, field: keyof WorkflowComponent, value: any) => {
    setComponents(components.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeComponent = (id: string) => {
    if (components.length > 1) {
      setComponents(components.filter(c => c.id !== id));
    }
  };

  const exportJSON = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      components: components,
      costAnalysis: costAnalysis,
      userRole: getUserRole(),
      calculationType: isAdvanced ? 'advanced' : 'simple'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lyzr-cost-estimate-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCostPerUnit = (type: WorkflowComponent['type']) => {
    const costs = {
      agent: 100,
      app: 50,
      knowledge_base: 25,
      token_volume: 0.001,
      rai_runs: 200,
      api_calls: 1
    };
    return costs[type];
  };

  const calculateTotalBaseCost = () => {
    return components.reduce((total, component) => {
      const baseCost = component.quantity * getCostPerUnit(component.type);
      const frequencyMultiplier = {
        hourly: 730, // ~24 * 30.4
        daily: 30.4,
        weekly: 4.3,
        monthly: 1
      }[component.frequency];
      return total + (baseCost * frequencyMultiplier);
    }, 0);
  };

  useEffect(() => {
    if (components.length > 0) {
      const timeoutId = setTimeout(() => {
        calculateCosts();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [components, isAdvanced]);

  const PieChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let cumulative = 0;

    return (
      <div className="relative w-48 h-48">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          {data.map((item, index) => {
            const startAngle = (cumulative / total) * 360;
            const endAngle = ((cumulative + item.value) / total) * 360;
            const largeArcFlag = item.value > total / 2 ? 1 : 0;

            const startX = 50 + 30 * Math.cos(startAngle * Math.PI / 180);
            const startY = 50 + 30 * Math.sin(startAngle * Math.PI / 180);
            const endX = 50 + 30 * Math.cos(endAngle * Math.PI / 180);
            const endY = 50 + 30 * Math.sin(endAngle * Math.PI / 180);

            cumulative += item.value;

            return (
              <path
                key={index}
                d={`M 50 50 L ${startX} ${startY} A 30 30 0 ${largeArcFlag} 1 ${endX} ${endY} Z`}
                fill={item.color}
                stroke="white"
                strokeWidth="1"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{Math.round(total)}</div>
            <div className="text-xs text-gray-600">credits</div>
          </div>
        </div>
      </div>
    );
  };

  const getChartData = () => {
    if (!costAnalysis) return [];

    return [
      { label: 'Agents', value: costAnalysis.breakdown.agents, color: '#006CFF' },
      { label: 'Apps', value: costAnalysis.breakdown.apps, color: '#00C0C7' },
      { label: 'Knowledge Bases', value: costAnalysis.breakdown.knowledgeBases, color: '#27AE60' },
      { label: 'Tokens', value: costAnalysis.breakdown.tokenVolumes, color: '#F2994A' },
      { label: 'RAI', value: costAnalysis.breakdown.raiRuns, color: '#E74C3C' },
      { label: 'API', value: costAnalysis.breakdown.apiCalls, color: '#4F8CFD' }
    ];
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Lyzr Cost Estimator</h1>
              <p className="text-gray-600">Calculate your workflow component costs with real-time estimates</p>
            </div>
            <div className="flex items-center space-x-4 mt-4 md:mt-0">
              <button
                onClick={() => setIsAdvanced(!isAdvanced)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isAdvanced
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {isAdvanced ? 'Advanced' : 'Simple'} Mode
              </button>
              <button
                onClick={exportJSON}
                disabled={!costAnalysis}
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Export JSON
              </button>
            </div>
          </div>
        </div>

        {notification && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {notification}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs Panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Workflow Components</h2>
                <button
                  onClick={addComponent}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Component
                </button>
              </div>

              <div className="space-y-4">
                {components.map((component) => (
                  <div key={component.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Component Name</label>
                        <input
                          type="text"
                          value={component.name}
                          onChange={(e) => updateComponent(component.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <select
                          value={component.type}
                          onChange={(e) => updateComponent(component.id, 'type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="agent">AI Agent</option>
                          <option value="app">Application</option>
                          <option value="knowledge_base">Knowledge Base</option>
                          <option value="token_volume">Token Volume</option>
                          <option value="rai_runs">RAI Runs</option>
                          <option value="api_calls">API Calls</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={component.quantity}
                          onChange={(e) => updateComponent(component.id, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex items-end space-x-2">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                          <select
                            value={component.frequency}
                            onChange={(e) => updateComponent(component.id, 'frequency', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="hourly">Hourly</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        {components.length > 1 && (
                          <button
                            onClick={() => removeComponent(component.id)}
                            className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {isAdvanced && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Cost per unit:</span>
                            <div className="font-medium">{getCostPerUnit(component.type)} credits</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Quantity:</span>
                            <div className="font-medium">{component.quantity}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Frequency:</span>
                            <div className="font-medium">{component.frequency}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Monthly Cost:</span>
                            <div className="font-medium">{Math.round(component.quantity * getCostPerUnit(component.type) * {
                              hourly: 730,
                              daily: 30.4,
                              weekly: 4.3,
                              monthly: 1
                            }[component.frequency])} credits</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {isAdvanced && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Cost Breakdown by Category</h3>
                {costAnalysis && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.entries(costAnalysis.breakdown).map(([category, cost]) => (
                      <div key={category} className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-600 capitalize">
                          {category.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </div>
                        <div className="text-2xl font-bold text-gray-800">{Math.round(cost)}</div>
                        <div className="text-sm text-gray-500">credits</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {/* Total Cost Card */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Estimated Costs</h3>
                  <div className="text-center mb-6">
                    <div className="text-4xl font-bold text-blue-600 mb-2">
                      {costAnalysis ? Math.round(costAnalysis.totalCredits) : Math.round(calculateTotalBaseCost())} credits
                    </div>
                    <div className="text-lg text-gray-600">
                      ≈ ${costAnalysis ? (costAnalysis.usdEquivalent).toFixed(2) : (calculateTotalBaseCost() * 0.01).toFixed(2)} USD
                    </div>
                  </div>

                  {costAnalysis && costAnalysis.raiCost > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                        <div className="text-sm font-medium text-red-800">
                          Responsible AI Monitoring: {Math.round(costAnalysis.raiCost)} credits
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Base Cost:</span>
                      <span className="font-medium">{Math.round(calculateTotalBaseCost())} credits</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">RAI Cost:</span>
                      <span className="font-medium">{costAnalysis ? Math.round(costAnalysis.raiCost) : 0} credits</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-800 font-medium">Total:</span>
                      <span className="font-bold text-blue-600">
                        {costAnalysis ? Math.round(costAnalysis.totalCredits) : Math.round(calculateTotalBaseCost())} credits
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Visualization */}
            {isAdvanced && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Cost Distribution</h3>
                {costAnalysis && (
                  <div className="flex flex-col items-center">
                    <PieChart data={getChartData()} />
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      {getChartData().map((item, index) => (
                        <div key={index} className="flex items-center">
                          <div
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: item.color }}
                          ></div>
                          <span className="text-gray-700">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Setup</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setComponents([
                    { id: generateRandomId(), name: 'Chat Agent', type: 'agent', quantity: 1, frequency: 'daily' },
                    { id: generateRandomId(), name: 'Document Processing', type: 'token_volume', quantity: 1000, frequency: 'hourly' }
                  ])}
                  className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  Developer Workflow
                </button>
                <button
                  onClick={() => setComponents([
                    { id: generateRandomId(), name: 'Compliance Checker', type: 'rai_runs', quantity: 10, frequency: 'daily' },
                    { id: generateRandomId(), name: 'Reports App', type: 'app', quantity: 1, frequency: 'weekly' }
                  ])}
                  className="w-full px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                >
                  Compliance Setup
                </button>
                <button
                  onClick={() => setComponents([
                    { id: generateRandomId(), name: 'Finance Bot', type: 'agent', quantity: 2, frequency: 'hourly' },
                    { id: generateRandomId(), name: 'Audit Trail', type: 'knowledge_base', quantity: 1, frequency: 'monthly' }
                  ])}
                  className="w-full px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                >
                  Finance Operations
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}