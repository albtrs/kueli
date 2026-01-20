import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SessionProvider } from '@/providers/SessionProvider'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ArchivedPage } from '@/pages/ArchivedPage'
import { AttachmentsPage } from '@/pages/AttachmentsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotePage } from '@/pages/NotePage'
import { NewNotePage } from '@/pages/NewNotePage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/archived" element={<ArchivedPage />} />
            <Route path="/attachments" element={<AttachmentsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notes/new" element={<NewNotePage />} />
            <Route path="/notes/:id" element={<NotePage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
