import { useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timer, Smile, AlertCircle, Calendar, TrendingUp, Trophy, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Link } from "wouter";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Calculate next Tuesday at 7pm in local timezone
function getNextTuesdayAt7PMLocal(): number {
  const now = new Date();
  const daysUntilTuesday = (2 - now.getDay() + 7) % 7 || 7; // 2 = Tuesday
  const nextTuesday = new Date(now);
  nextTuesday.setDate(now.getDate() + daysUntilTuesday);
  nextTuesday.setHours(19, 0, 0, 0); // 7pm local time
  
  // If we're past 7pm on Tuesday, go to next week
  if (nextTuesday.getTime() <= now.getTime()) {
    nextTuesday.setDate(nextTuesday.getDate() + 7);
  }
  
  return nextTuesday.getTime();
}

export default function Home() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: lastEvent } = trpc.tray.getLastEvent.useQuery();

  const checkAndUpdate = trpc.settings.checkAndUpdateTray.useMutation();
  const logEvent = trpc.tray.logEvent.useMutation();
  const updateNextChangeTime = trpc.settings.updateNextChangeTime.useMutation();
  const cancelRemoveEvent = trpc.tray.cancelRemoveEvent.useMutation();
  const checkAchievements = trpc.achievements.checkAndAward.useMutation();
  const { data: achievements } = trpc.achievements.getAll.useQuery();
  
  const [isTrayOut, setIsTrayOut] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [removalStartTime, setRemovalStartTime] = useState<number | null>(null);
  const [lastRemoveEventId, setLastRemoveEventId] = useState<string | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);
  const [canCancel, setCanCancel] = useState(false);

  // Sync next change time with local timezone when settings load
  useEffect(() => {
    if (settings) {
      const localNextChangeTime = getNextTuesdayAt7PMLocal();
      // If the stored time is significantly different (more than 1 hour), update it
      // This handles timezone differences between server and client
      const timeDiff = Math.abs(settings.nextTrayChangeTime - localNextChangeTime);
      if (timeDiff > 60 * 60 * 1000) { // More than 1 hour difference
        updateNextChangeTime.mutate({ nextChangeTime: localNextChangeTime });
      }
    }
  }, [settings, updateNextChangeTime]);

  // Check for tray auto-increment on mount and periodically
  useEffect(() => {
    const checkTrayUpdate = async () => {
      const result = await checkAndUpdate.mutateAsync();
      if (result.changed) {
        toast.success(`Tray updated to #${result.newTrayNumber}! 🎉`, {
          description: "Time for your next aligner!",
        });
        utils.settings.get.invalidate();
      }
    };
    
    checkTrayUpdate();
    const interval = setInterval(checkTrayUpdate, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);

  // Check for achievements on mount
  useEffect(() => {
    const checkAchievementsOnLoad = async () => {
      try {
        await checkAchievements.mutateAsync();
        utils.achievements.getAll.invalidate();
      } catch (err) {
        // Silently fail
        console.error("Failed to check achievements on load:", err);
      }
    };
    
    checkAchievementsOnLoad();
  }, []);

  // Initialize state from last event
  useEffect(() => {
    if (lastEvent) {
      const isOut = lastEvent.eventType === "remove";
      setIsTrayOut(isOut);
      
      if (isOut) {
        const now = Date.now();
        const elapsed = now - lastEvent.timestamp;
        setRemovalStartTime(lastEvent.timestamp);
        setLastRemoveEventId(lastEvent.id);
        setElapsedTime(elapsed);
        setCanCancel(elapsed < 60 * 1000); // Can cancel if within 60 seconds
      } else {
        setRemovalStartTime(null);
        setElapsedTime(0);
        setLastRemoveEventId(null);
        setCanCancel(false);
      }
    }
  }, [lastEvent]);

  // Timer effect
  useEffect(() => {
    if (!isTrayOut || removalStartTime === null) {
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - removalStartTime;
      setElapsedTime(elapsed);
      
      // Check if we can still cancel (within 60 seconds)
      const sixtySeconds = 60 * 1000;
      setCanCancel(elapsed < sixtySeconds);
      
      // Check for 30-minute reminder
      if (elapsed >= 30 * 60 * 1000 && !showReminder) {
        setShowReminder(true);
        
        // Try to show browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Tray Reminder! 🦷", {
            body: "Your tray has been out for 30 minutes. Time to put it back in!",
            icon: "/favicon.ico",
          });
        }
        
        toast.warning("Tray has been out for 30 minutes!", {
          description: "Time to put your tray back in!",
          duration: 10000,
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isTrayOut, removalStartTime, showReminder]);

  // Request notification permission on first interaction
  const requestNotificationPermission = useCallback(async () => {
    if ("Notification" in window && Notification.permission === "default" && !hasRequestedPermission) {
      setHasRequestedPermission(true);
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        toast.success("Notifications enabled! 🔔");
      }
    }
  }, [hasRequestedPermission]);

  const handleToggle = async () => {
    await requestNotificationPermission();
    
    const now = Date.now();
    const newEventType = isTrayOut ? "insert" : "remove";
    
    try {
      const result = await logEvent.mutateAsync({
        eventType: newEventType,
        trayNumber: settings?.currentTrayNumber || 2,
        timestamp: now,
      });
      
      if (newEventType === "remove") {
        setIsTrayOut(true);
        setRemovalStartTime(now);
        setElapsedTime(0);
        setShowReminder(false);
        setLastRemoveEventId(result.eventId);
        setCanCancel(true);
        toast.success("Tray removed - timer started! ⏱️");
      } else {
        const duration = removalStartTime ? now - removalStartTime : 0;
        setIsTrayOut(false);
        setRemovalStartTime(null);
        setElapsedTime(0);
        setShowReminder(false);
        setLastRemoveEventId(null);
        setCanCancel(false);
        toast.success(`Tray inserted! Out for ${formatTime(duration)} 🦷`);
        
        // Check for achievements after inserting
        try {
          const achievementResult = await checkAchievements.mutateAsync();
          if (achievementResult.newAchievements.length > 0) {
            achievementResult.newAchievements.forEach((achievement) => {
              toast.success(`Achievement Unlocked! ${achievement.icon}`, {
                description: achievement.title,
                duration: 5000,
              });
            });
            utils.achievements.getAll.invalidate();
          }
        } catch (err) {
          // Silently fail achievement check
          console.error("Failed to check achievements:", err);
        }
      }
      
      utils.tray.getLastEvent.invalidate();
      utils.compliance.getToday.invalidate();
    } catch (error) {
      toast.error("Failed to log event");
      console.error(error);
    }
  };

  const handleCancel = async () => {
    if (!lastRemoveEventId) return;
    
    try {
      await cancelRemoveEvent.mutateAsync({ eventId: lastRemoveEventId });
      setIsTrayOut(false);
      setRemovalStartTime(null);
      setElapsedTime(0);
      setShowReminder(false);
      setLastRemoveEventId(null);
      setCanCancel(false);
      toast.success("Take Out event cancelled");
      utils.tray.getLastEvent.invalidate();
      utils.compliance.getToday.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel event");
      console.error(error);
    }
  };

  // Calculate next Tuesday at 7pm in local time for accurate countdown
  const nextChangeTimeLocal = getNextTuesdayAt7PMLocal();
  const timeUntilNextTray = settings ? nextChangeTimeLocal - Date.now() : 0;
  const isOverdue = elapsedTime >= 30 * 60 * 1000;

  // Determine compliance status color
  const getComplianceColor = (percentage: number) => {
    if (percentage >= 95) return "text-green-600";
    if (percentage >= 85) return "text-yellow-600";
    return "text-red-600";
  };

  const getComplianceBgColor = (percentage: number) => {
    if (percentage >= 95) return "bg-green-100 border-green-300";
    if (percentage >= 85) return "bg-yellow-100 border-yellow-300";
    return "bg-red-100 border-red-300";
  };

  const getComplianceMessage = (percentage: number) => {
    if (percentage >= 95) return "Excellent compliance! 🌟";
    if (percentage >= 85) return "Good progress! Keep it up! 👍";
    return "Need more wear time today 💪";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container max-w-4xl py-8 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
            Tray Tracker
          </h1>
          <p className="text-muted-foreground text-lg">
            Keep your smile journey on track! 😁
          </p>
        </motion.div>



        {/* Current Tray Info */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="mb-6 shadow-playful border-2">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-primary p-3 rounded-xl">
                    <Smile className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Tray</p>
                    <p className="text-3xl font-bold text-primary">
                      #{settings?.currentTrayNumber || 2}
                      <span className="text-lg text-muted-foreground ml-2">
                        of {settings?.totalTrays || 16}
                      </span>
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="bg-secondary/20 p-3 rounded-xl">
                    <Calendar className="w-6 h-6 text-secondary" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Next Change</p>
                    <p className="text-xl font-semibold text-secondary">
                      {timeUntilNextTray > 0 ? formatCountdown(timeUntilNextTray) : "Soon!"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Timer Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="mb-6 shadow-playful border-2">
            <CardHeader>
              <CardTitle className="text-center text-2xl">
                {isTrayOut ? "Tray is Out" : "Tray is In"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Timer Display */}
              <AnimatePresence mode="wait">
                {isTrayOut && (
                  <motion.div
                    key="timer"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-center"
                  >
                    <div className={`inline-flex items-center gap-3 px-8 py-4 rounded-2xl ${
                      isOverdue 
                        ? "bg-warning/20 border-2 border-warning" 
                        : "bg-primary/10 border-2 border-primary/30"
                    }`}>
                      <Timer className={`w-8 h-8 ${isOverdue ? "text-warning" : "text-primary"}`} />
                      <span className={`text-5xl md:text-6xl font-bold tabular-nums ${
                        isOverdue ? "text-warning" : "text-primary"
                      }`}>
                        {formatTime(elapsedTime)}
                      </span>
                    </div>
                    
                    {isOverdue && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 flex items-center justify-center gap-2 text-warning"
                      >
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-semibold">Over 30 minutes!</span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Toggle Button */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex flex-col items-center gap-3"
              >
                <Button
                  onClick={handleToggle}
                  disabled={logEvent.isPending}
                  size="lg"
                  className={`h-24 px-12 text-2xl font-bold rounded-2xl transition-smooth shadow-lg ${
                    isTrayOut
                      ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                      : "bg-gradient-primary hover:opacity-90"
                  }`}
                >
                  {isTrayOut ? "Put In 🦷" : "Take Out 🦷"}
                </Button>
                
                {/* Cancel Button */}
                <AnimatePresence>
                  {isTrayOut && canCancel && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <Button
                        onClick={handleCancel}
                        disabled={cancelRemoveEvent.isPending}
                        variant="outline"
                        size="sm"
                        className="gap-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <X className="w-4 h-4" />
                        Cancel ({(60 - Math.floor(elapsedTime / 1000)).toFixed(0)}s)
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {!isTrayOut && (
                <p className="text-center text-muted-foreground text-sm">
                  Click when you remove your tray to start the timer
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Achievements Section */}
        {achievements && achievements.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-6"
          >
            <Card className="shadow-playful border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  Achievements & Trophies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {achievements.slice(0, 8).map((achievement) => (
                    <motion.div
                      key={achievement.id}
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className="flex flex-col items-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="text-3xl mb-1">{achievement.icon}</div>
                      <div className="text-xs font-semibold text-center">{achievement.title}</div>
                    </motion.div>
                  ))}
                </div>
                {achievements.length > 8 && (
                  <p className="text-center text-sm text-muted-foreground mt-3">
                    +{achievements.length - 8} more achievements
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Dashboard Link */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <Link href="/dashboard">
            <Button variant="outline" size="lg" className="gap-2">
              <TrendingUp className="w-5 h-5" />
              View Dashboard & Analytics
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
