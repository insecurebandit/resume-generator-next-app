'use client';

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { PersonalInfo } from './components/PersonalInfo';
import { ProfessionalSummary } from './components/ProfessionalSummary';
import { WorkExperience } from './components/WorkExperience';
import { Education } from './components/Education';
import { FormData } from '../types/form';
import { validateField, validateForm } from '../utils/validation';
import { SkillsTags } from './components/SkillsTags';
import { Preview, generateResumeHtml } from './components/Preview';
import { db, debouncedSaveFormData } from '../utils/indexedDB';

export default function Home() {
  const [formData, setFormData] = useState<FormData>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);

  const handleFormUpdate = (field: string, value: unknown) => {
    setFormData((prev: FormData) => ({
      ...prev,
      [field]: value,
    }));

    // Validate field on update
    const fieldError = validateField(field, value);
    if (fieldError) {
      setErrors((prev) => ({
        ...prev,
        [field]: fieldError,
      }));
    } else if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }

    // Calculate progress based on valid fields
    const requiredFields = ['name', 'email', 'phone', 'summary', 'experience'];
    const filledRequiredFields = requiredFields.filter((f) => {
      const v = (formData as unknown as Record<string, unknown>)[f];
      return v && String(v as string).trim() !== '' && !errors[f];
    });

    const newProgress = Math.round((filledRequiredFields.length / requiredFields.length) * 100);
    setProgress(newProgress);
  };

  // Load form data from IndexedDB on mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedData = await db.loadFormData();
        if (savedData) {
          setFormData(savedData);
        }
      } catch (e) {
        console.error('Failed to load saved form data:', e);
      }
    };
    loadSavedData();
  }, []);

  // Save form data to IndexedDB when it changes
  useEffect(() => {
    // Don't save empty form data
    if (Object.keys(formData).length === 0) return;
    
    // Save with debounce
    debouncedSaveFormData(formData);
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const formErrors = validateForm(formData);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);

      // Update progress considering validation errors
      const requiredFields = ['name', 'email', 'phone', 'summary', 'experience'];
      const validFields = requiredFields.filter((field) => !formErrors[field]);
      const newProgress = Math.round((validFields.length / requiredFields.length) * 100);
      setProgress(newProgress);

      // Scroll to first error (use name attribute selector)
      const firstFieldName = Object.keys(formErrors)[0];
      const firstErrorField = document.querySelector(`[name="${firstFieldName}"]`);
      if (firstErrorField instanceof HTMLElement) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Proceed with form submission
    try {
      const html = generateResumeHtml(formData as FormData);
      // dynamically import html2pdf (client-side); library may need to be installed
  let html2pdf: unknown = null;
      try {
        // html2pdf may not be installed in the repo; attempt to import dynamically
        const mod = await import('html2pdf.js');
  html2pdf = (mod && (mod.default || mod));
      } catch {
        console.warn('html2pdf.js not installed; falling back to print');
      }

      const opt = {
        margin: 10,
        filename: `${(formData.name || 'resume').replace(/\s+/g,'_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      const container = document.createElement('div');
      container.style.display = 'block';
      container.innerHTML = html;
      document.body.appendChild(container);
      if (typeof html2pdf === 'function') {
        // html2pdf is a function factory; narrow to function then call
        // Define minimal chain interface to avoid using `any`
        type Html2PdfChain = {
          set: (opts: unknown) => Html2PdfChain;
          from: (el: HTMLElement) => Html2PdfChain;
          save: () => Promise<void>;
        };
  await (html2pdf as unknown as () => Html2PdfChain)().set(opt).from(container).save();
      } else {
        // fallback: open print preview
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
          setTimeout(() => w.print(), 300);
        }
      }
      document.body.removeChild(container);
      // Clear saved data after successful download
      await db.clearFormData();
    } catch (err) {
      console.error('PDF generation failed', err);
      // fallback: open print preview
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(generateResumeHtml(formData as FormData));
        w.document.close();
        setTimeout(() => w.print(), 300);
      }
    }
  };

  return (
    <div className="container">
      <Header progress={progress} />
      <div className="main-content">
        <div className="form-section">
          <form id="resumeForm" onSubmit={handleSubmit} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
              <div>
                <PersonalInfo formData={formData} onUpdate={handleFormUpdate} errors={errors} />
                <ProfessionalSummary formData={formData} onUpdate={handleFormUpdate} errors={errors} />
                <WorkExperience formData={formData} onUpdate={handleFormUpdate} errors={errors} />
                <Education formData={formData} onUpdate={handleFormUpdate} />
                <SkillsTags formData={formData} onUpdate={handleFormUpdate} />
                <div style={{ marginTop: 12 }}>
                  <button type="submit">Generate Resume</button>
                </div>
              </div>

              <aside>
                <Preview formData={formData} />
              </aside>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}