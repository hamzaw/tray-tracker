import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BarChart3, Clock, Hash, Calendar, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDurationShort(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  return `${totalMinutes}min`;
}

export default function Dashboard() {
  const [timePeriod, setTimePeriod] = useState<"day" | "week" | "month">("week");
  const [timeRange, setTimeRange] = useState<number>(7); // days
  const [complianceRange, setComplianceRange] = useState<number>(7); // days for compliance history
  
  const { data: trayAnalytics, isLoading: trayLoading } = trpc.analytics.byTray.useQuery();
  
  const startTime = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() - timeRange);
    return now.getTime();
  }, [timeRange]);
  
  const endTime = useMemo(() => Date.now(), []);
  
  const { data: timeAnalytics, isLoading: timeLoading } = trpc.analytics.byTimePeriod.useQuery({
    startTime,
    endTime,
    groupBy: timePeriod,
  });

  // Compliance history
  const complianceStartDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - complianceRange);
    return date.toISOString().split("T")[0];
  }, [complianceRange]);

  const complianceEndDate = useMemo(() => {
    return new Date().toISOString().split("T")[0];
  }, []);

  const { data: complianceHistory, isLoading: complianceLoading } = trpc.compliance.getHistory.useQuery({
    startDate: complianceStartDate,
    endDate: complianceEndDate,
  });

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!trayAnalytics) return null;
    
    const totalRemovals = trayAnalytics.reduce((sum, t) => sum + t.removeCount, 0);
    const totalDuration = trayAnalytics.reduce((sum, t) => sum + t.totalDuration, 0);
    const avgDuration = totalRemovals > 0 ? totalDuration / totalRemovals : 0;
    const traysUsed = trayAnalytics.length;
    
    return {
      totalRemovals,
      totalDuration,
      avgDuration,
      traysUsed,
    };
  }, [trayAnalytics]);

  // Prepare chart data for tray analytics
  const trayChartData = useMemo(() => {
    if (!trayAnalytics) return [];
    
    return trayAnalytics.map(t => ({
      name: `Tray ${t.trayNumber}`,
      trayNumber: t.trayNumber,
      removals: t.removeCount,
      duration: Math.round(t.totalDuration / 60000), // Convert to minutes
      avgDuration: Math.round(t.avgDuration / 60000),
    }));
  }, [trayAnalytics]);

  // Prepare chart data for time analytics
  const timeChartData = useMemo(() => {
    if (!timeAnalytics) return [];
    
    return timeAnalytics.map(t => {
      let label = t.period;
      
      // Format the period label
      if (timePeriod === "day") {
        const date = new Date(t.period);
        label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (timePeriod === "week") {
        const date = new Date(t.period);
        label = `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      } else {
        const [year, month] = t.period.split("-");
        const date = new Date(parseInt(year), parseInt(month) - 1);
        label = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      }
      
      return {
        name: label,
        removals: t.removeCount,
        duration: Math.round(t.totalDuration / 60000), // Convert to minutes
        avgDuration: Math.round(t.avgDuration / 60000),
      };
    });
  }, [timeAnalytics, timePeriod]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container max-w-7xl py-8 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link href="/">
            <Button variant="ghost" className="mb-4 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Timer
            </Button>
          </Link>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-primary p-3 rounded-xl">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold">Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Track your progress and usage patterns
          </p>
        </motion.div>

        {/* Summary Cards */}
        {summaryStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          >
            <Card className="shadow-playful border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Total Removals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {summaryStats.totalRemovals}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-playful border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Total Time Out
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-secondary">
                  {formatDuration(summaryStats.totalDuration)}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-playful border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Avg Duration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-accent">
                  {formatDuration(summaryStats.avgDuration)}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-playful border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Trays Used
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  {summaryStats.traysUsed}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Analytics Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="tray" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="tray">By Tray</TabsTrigger>
              <TabsTrigger value="time">By Time</TabsTrigger>
            </TabsList>

            {/* Compliance Tab */}
            <TabsContent value="compliance" className="space-y-6">
              {/* Date Range Selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Show last:</label>
                <Select value={complianceRange.toString()} onValueChange={(v) => setComplianceRange(parseInt(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card className="shadow-playful border-2">
                <CardHeader>
                  <CardTitle>Daily Compliance History</CardTitle>
                  <CardDescription>
                    Track your daily wear time compliance (Target: 22.5 hours/day)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {complianceLoading ? (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      Loading compliance data...
                    </div>
                  ) : !complianceHistory || complianceHistory.length === 0 ? (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      No compliance data yet. Start tracking to see your progress!
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={complianceHistory.map(d => ({
                        date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                        compliance: d.compliancePercentage,
                        wearHours: Math.round(d.wearTime / (60 * 60 * 1000) * 10) / 10,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 264)" />
                        <XAxis 
                          dataKey="date" 
                          stroke="oklch(0.50 0.02 264)"
                          tick={{ fill: "oklch(0.50 0.02 264)" }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis 
                          stroke="oklch(0.50 0.02 264)"
                          tick={{ fill: "oklch(0.50 0.02 264)" }}
                          domain={[0, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "oklch(1 0 0)",
                            border: "2px solid oklch(0.90 0.01 264)",
                            borderRadius: "0.75rem",
                          }}
                          formatter={(value: number, name: string) => {
                            if (name === "compliance") return [`${value.toFixed(1)}%`, "Compliance"];
                            return [`${value}h`, "Wear Time"];
                          }}
                        />
                        <Legend />
                        {/* Reference line at 95% (excellent) */}
                        <Line 
                          type="monotone" 
                          dataKey="compliance" 
                          stroke="oklch(0.65 0.19 195)" 
                          strokeWidth={3}
                          name="Compliance %"
                          dot={{ fill: "oklch(0.65 0.19 195)", r: 4 }}
                        />
                        {/* Add a reference line at 95% */}
                        <Line 
                          type="monotone" 
                          y={95}
                          stroke="oklch(0.70 0.18 145)"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Compliance Summary Stats */}
              {complianceHistory && complianceHistory.length > 0 && (
                <Card className="shadow-playful border-2">
                  <CardHeader>
                    <CardTitle>Compliance Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-green-50 rounded-lg border-2 border-green-200">
                        <p className="text-sm text-muted-foreground mb-1">Excellent Days</p>
                        <p className="text-3xl font-bold text-green-600">
                          {complianceHistory.filter(d => d.compliancePercentage >= 95).length}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">≥95% compliance</p>
                      </div>
                      <div className="text-center p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                        <p className="text-sm text-muted-foreground mb-1">Good Days</p>
                        <p className="text-3xl font-bold text-yellow-600">
                          {complianceHistory.filter(d => d.compliancePercentage >= 85 && d.compliancePercentage < 95).length}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">85-94% compliance</p>
                      </div>
                      <div className="text-center p-4 bg-red-50 rounded-lg border-2 border-red-200">
                        <p className="text-sm text-muted-foreground mb-1">Needs Improvement</p>
                        <p className="text-3xl font-bold text-red-600">
                          {complianceHistory.filter(d => d.compliancePercentage < 85).length}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">&lt;85% compliance</p>
                      </div>
                    </div>
                    <div className="mt-4 text-center">
                      <p className="text-sm text-muted-foreground">Average Compliance</p>
                      <p className="text-4xl font-bold text-primary">
                        {(complianceHistory.reduce((sum, d) => sum + d.compliancePercentage, 0) / complianceHistory.length).toFixed(1)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* By Tray Tab */}
            <TabsContent value="tray" className="space-y-6">
              <Card className="shadow-playful border-2">
                <CardHeader>
                  <CardTitle>Usage by Tray Number</CardTitle>
                  <CardDescription>
                    Compare removal frequency and duration across different trays
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {trayLoading ? (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      Loading analytics...
                    </div>
                  ) : trayChartData.length === 0 ? (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      No data yet. Start tracking to see analytics!
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={trayChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 264)" />
                        <XAxis 
                          dataKey="name" 
                          stroke="oklch(0.50 0.02 264)"
                          tick={{ fill: "oklch(0.50 0.02 264)" }}
                        />
                        <YAxis 
                          stroke="oklch(0.50 0.02 264)"
                          tick={{ fill: "oklch(0.50 0.02 264)" }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "oklch(1 0 0)",
                            border: "2px solid oklch(0.90 0.01 264)",
                            borderRadius: "0.75rem",
                          }}
                          formatter={(value: number, name: string) => {
                            if (name === "removals") return [value, "Removals"];
                            return [formatDurationShort(value * 60000), name === "duration" ? "Total Time" : "Avg Time"];
                          }}
                        />
                        <Legend />
                        <Bar dataKey="removals" fill="oklch(0.65 0.19 195)" name="Removals" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="duration" fill="oklch(0.75 0.15 35)" name="Total Time (min)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Tray Details Table */}
              {trayAnalytics && trayAnalytics.length > 0 && (
                <Card className="shadow-playful border-2">
                  <CardHeader>
                    <CardTitle>Detailed Statistics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b-2 border-border">
                            <th className="text-left py-3 px-4 font-semibold">Tray</th>
                            <th className="text-right py-3 px-4 font-semibold">Removals</th>
                            <th className="text-right py-3 px-4 font-semibold">Total Time</th>
                            <th className="text-right py-3 px-4 font-semibold">Avg Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trayAnalytics.map((tray) => (
                            <tr key={tray.trayNumber} className="border-b border-border hover:bg-muted/50">
                              <td className="py-3 px-4 font-medium">Tray #{tray.trayNumber}</td>
                              <td className="text-right py-3 px-4">{tray.removeCount}</td>
                              <td className="text-right py-3 px-4">{formatDuration(tray.totalDuration)}</td>
                              <td className="text-right py-3 px-4">{formatDuration(tray.avgDuration)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* By Time Tab */}
            <TabsContent value="time" className="space-y-6">
              {/* Time Range Selector */}
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">View:</label>
                  <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as any)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Daily</SelectItem>
                      <SelectItem value="week">Weekly</SelectItem>
                      <SelectItem value="month">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Range:</label>
                  <Select value={timeRange.toString()} onValueChange={(v) => setTimeRange(parseInt(v))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="60">Last 60 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="shadow-playful border-2">
                <CardHeader>
                  <CardTitle>Usage Over Time</CardTitle>
                  <CardDescription>
                    Track your removal patterns and duration trends
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timeLoading ? (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      Loading analytics...
                    </div>
                  ) : timeChartData.length === 0 ? (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      No data for selected time range
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={timeChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.90 0.01 264)" />
                        <XAxis 
                          dataKey="name" 
                          stroke="oklch(0.50 0.02 264)"
                          tick={{ fill: "oklch(0.50 0.02 264)" }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis 
                          stroke="oklch(0.50 0.02 264)"
                          tick={{ fill: "oklch(0.50 0.02 264)" }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "oklch(1 0 0)",
                            border: "2px solid oklch(0.90 0.01 264)",
                            borderRadius: "0.75rem",
                          }}
                          formatter={(value: number, name: string) => {
                            if (name === "removals") return [value, "Removals"];
                            return [formatDurationShort(value * 60000), name === "duration" ? "Total Time" : "Avg Time"];
                          }}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="removals" 
                          stroke="oklch(0.65 0.19 195)" 
                          strokeWidth={3}
                          name="Removals"
                          dot={{ fill: "oklch(0.65 0.19 195)", r: 5 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="avgDuration" 
                          stroke="oklch(0.70 0.18 285)" 
                          strokeWidth={3}
                          name="Avg Time (min)"
                          dot={{ fill: "oklch(0.70 0.18 285)", r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
