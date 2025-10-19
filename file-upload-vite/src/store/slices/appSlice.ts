import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AppState } from '@/types';

const initialState: AppState = {
  theme: 'light',
  sidebarCollapsed: false,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebar: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
  },
});

export const { 
  toggleTheme, 
  setTheme, 
  toggleSidebar, 
  setSidebar, 
} = appSlice.actions;
export default appSlice.reducer;