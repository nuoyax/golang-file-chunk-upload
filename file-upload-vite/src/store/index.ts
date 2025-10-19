import { configureStore } from '@reduxjs/toolkit';
import uploadReducer from './slices/uploadSlice';
import appReducer from './slices/appSlice';
import authReducer from './slices/authSlice';

export  const store = configureStore({
  reducer: {
    upload: uploadReducer,
    app: appReducer,
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;