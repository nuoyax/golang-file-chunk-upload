import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { ConfigProvider, App as AntdApp } from 'antd';
import { store } from './store';
import AppRoutes from './routes';
import { useAppSelector } from './hooks/redux';

const ThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useAppSelector(state => state.app);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
        },
        algorithm: theme === 'dark' ? undefined : undefined, // 简化处理
      }}
    >
      <AntdApp>
        {children}
      </AntdApp>
    </ConfigProvider>
  );
};

const AppContent: React.FC = () => {
  return (
    <ThemeWrapper>
      <AppRoutes />
    </ThemeWrapper>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
};

export default App;