'use client';

import { ToastContainer } from 'react-toastify';

export default function ToastProvider() {
  return <ToastContainer autoClose={15000} closeOnClick newestOnTop pauseOnFocusLoss pauseOnHover position="top-right" theme="dark" limit={4} />;
}
