import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider, Box } from '@chakra-ui/react';
import theme from './theme';
import { Lists } from './pages/Lists';
import { ListDetail } from './pages/ListDetail';
import { Learn } from './pages/Learn';
import { Quiz } from './pages/Quiz';
import { WordDetailPage } from './pages/WordDetail';
import { Settings } from './pages/Settings';
import { ImageDescription } from './pages/ImageDescription';
import { GetNewWords } from './pages/GetNewWords';
import { WordLearningSession } from './pages/WordLearningSession';
import { ReadingPage } from './pages/ReadingPage';
import { VoiceChat } from './pages/VoiceChat';
import { Header } from './components/Header';
import { MistakeBook } from './pages/MistakeBook';
import { DueReview } from './pages/DueReview';
import { BackgroundProvider } from './components/BackgroundProvider';

function App() {
  return (
    <ChakraProvider theme={theme}>
      <Router>
        <BackgroundProvider>
          <Box minH="100vh" color="white">
            <Header />
            <Routes>
              <Route path="/" element={<Navigate to="/lists" replace />} />
              <Route path="/lists" element={<Lists />} />
              <Route path="/lists/:id" element={<ListDetail />} />
              <Route path="/learn/:id" element={<Learn />} />
              <Route path="/quiz/:id" element={<Quiz />} />
              <Route path="/mistakes" element={<MistakeBook />} />
              <Route path="/reviews" element={<DueReview />} />
              <Route path="/words/:wordId" element={<WordDetailPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/describe" element={<ImageDescription />} />
              <Route path="/learn-new-words" element={<GetNewWords />} />
              <Route path="/learn-new-words/session" element={<WordLearningSession />} />
              <Route path="/reading/:listId" element={<ReadingPage />} />
              <Route path="/voice-chat/:listId" element={<VoiceChat />} />
            </Routes>
          </Box>
        </BackgroundProvider>
      </Router>
    </ChakraProvider>
  );
}

export default App;
