import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { RefreshCw, BookOpen, Lightbulb, FileText, BarChart3 } from 'lucide-react';
import { translations, type Language } from '../lib/translations';

interface ResultsViewProps {
  language: Language;
  results: GenerationResults;
  onGenerateAnother: () => void;
}

export interface GenerationResults {
  story: string;
  titles: string[];
  synopsis: string;
  quality: QualityReport;
}

export interface QualityReport {
  overall: 'good' | 'warning';
  wordCount: {
    actual: number;
    target: number;
  };
  repetitionRate: number;
  pacing: {
    good: boolean;
    issues: number;
  };
  audioMetrics?: {
    sentenceLength: number;
    beatCompliance: number;
    transitions: {
      count: number;
      density: number;
    };
    dialogueAttribution: number;
  };
}

export function ResultsView({ language, results, onGenerateAnother }: ResultsViewProps) {
  const t = translations[language];

  const formatStoryText = (text: string) => {
    return text.split('\n\n').map((paragraph, i) => (
      <motion.p
        key={i}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.1 }}
        className="mb-4 text-white/80 leading-relaxed"
      >
        {paragraph}
      </motion.p>
    ));
  };

  const getQualityBadge = (quality: 'good' | 'warning') => {
    return quality === 'good' ? (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        {t.good}
      </Badge>
    ) : (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
        {t.warning}
      </Badge>
    );
  };

  const wordCountDiff = Math.abs(
    ((results.quality.wordCount.actual - results.quality.wordCount.target) /
      results.quality.wordCount.target) *
      100
  ).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-5xl mx-auto"
    >
      <Tabs defaultValue="story" className="w-full">
        <TabsList className="w-full bg-white/5 border border-white/10 p-1 mb-8">
          <TabsTrigger
            value="story"
            className="flex-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white text-white/60"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            {t.story}
          </TabsTrigger>
          <TabsTrigger
            value="titles"
            className="flex-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white text-white/60"
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            {t.titles}
          </TabsTrigger>
          <TabsTrigger
            value="synopsis"
            className="flex-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white text-white/60"
          >
            <FileText className="w-4 h-4 mr-2" />
            {t.synopsis}
          </TabsTrigger>
          <TabsTrigger
            value="quality"
            className="flex-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white text-white/60"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {t.qualityReport}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="story" className="mt-0">
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardContent className="p-8">
              {formatStoryText(results.story)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="titles" className="mt-0">
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardContent className="p-8">
              <ul className="space-y-4">
                {results.titles.map((title, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3 text-white/80"
                  >
                    <span className="text-purple-400 mt-1">•</span>
                    <span>{title}</span>
                  </motion.li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="synopsis" className="mt-0">
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardContent className="p-8">
              <p className="text-white/80 leading-relaxed">{results.synopsis}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white/90">{t.overallQuality}</CardTitle>
                </CardHeader>
                <CardContent>
                  {getQualityBadge(results.quality.overall)}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white/90">{t.wordCount}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/80">
                    {results.quality.wordCount.actual} / {results.quality.wordCount.target}
                  </p>
                  <p className="text-white/50">
                    {wordCountDiff}% {t.difference}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white/90">{t.repetitionRate}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/80">{results.quality.repetitionRate.toFixed(2)}</p>
                  <p
                    className={
                      results.quality.repetitionRate < 2
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }
                  >
                    {results.quality.repetitionRate < 2 ? `✓ ${t.acceptable}` : `⚠ ${t.high}`}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white/90">{t.pacing}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={
                      results.quality.pacing.good ? 'text-green-400' : 'text-yellow-400'
                    }
                  >
                    {results.quality.pacing.good
                      ? `✓ ${t.goodPacing}`
                      : `${results.quality.pacing.issues} ${t.issues}`}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {results.quality.audioMetrics && (
              <>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white/90">
                        🎙️ {t.sentenceLength} ({t.median})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-white/80">
                        {results.quality.audioMetrics.sentenceLength} words
                      </p>
                      <p
                        className={
                          results.quality.audioMetrics.sentenceLength <= 20
                            ? 'text-green-400'
                            : 'text-yellow-400'
                        }
                      >
                        {results.quality.audioMetrics.sentenceLength <= 20
                          ? `✓ ${t.goodForVO}`
                          : `⚠ ${t.tooLong}`}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white/90">🎙️ {t.beatCompliance}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-white/80">
                        {results.quality.audioMetrics.beatCompliance}%
                      </p>
                      <p
                        className={
                          results.quality.audioMetrics.beatCompliance >= 60
                            ? 'text-green-400'
                            : 'text-yellow-400'
                        }
                      >
                        {results.quality.audioMetrics.beatCompliance >= 60
                          ? `✓ ${t.good}`
                          : `⚠ Low`}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white/90">🎙️ {t.transitions}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-white/80">
                        {results.quality.audioMetrics.transitions.count} transitions,{' '}
                        {results.quality.audioMetrics.transitions.density.toFixed(2)} {t.density}
                        /1000w
                      </p>
                      <p
                        className={
                          results.quality.audioMetrics.transitions.density >= 1.2
                            ? 'text-green-400'
                            : 'text-yellow-400'
                        }
                      >
                        {results.quality.audioMetrics.transitions.density >= 1.2
                          ? `✓ ${t.sufficient}`
                          : `⚠ ${t.sparse}`}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white/90">
                        🎙️ {t.dialogueAttribution}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-white/80">
                        {results.quality.audioMetrics.dialogueAttribution}%
                      </p>
                      <p
                        className={
                          results.quality.audioMetrics.dialogueAttribution >= 60
                            ? 'text-green-400'
                            : 'text-yellow-400'
                        }
                      >
                        {results.quality.audioMetrics.dialogueAttribution >= 60
                          ? `✓ ${t.clearSpeakers}`
                          : `⚠ ${t.confusing}`}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8"
      >
        <Button
          onClick={onGenerateAnother}
          className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 py-6"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          {t.generateAnother}
        </Button>
      </motion.div>
    </motion.div>
  );
}
