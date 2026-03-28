import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import ClassesPage from './pages/ClassesPage';
import LessonsPage from './pages/LessonsPage';
import StudentsPage from './pages/StudentsPage';
import StudentDetailPage from './pages/StudentDetailPage';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn } = useAuthStore();
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  const { init } = useAuthStore();
  useEffect(() => { init(); }, [init]);

  return (
    <ConfigProvider locale={zhCN} theme={{
      token: {
        colorPrimary: '#4F46E5',
        borderRadius: 10,
        fontFamily: "'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
      },
    }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/classes" replace />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="lessons" element={<LessonsPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/:id" element={<StudentDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
