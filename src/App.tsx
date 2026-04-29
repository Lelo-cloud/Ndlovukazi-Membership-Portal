import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import { 
  User, 
  Briefcase, 
  CreditCard, 
  Users, 
  Baby, 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft,
  Plus,
  Trash2,
  MapPin,
  Phone,
  Mail,
  Lock,
  LogOut,
  Loader2,
  LayoutDashboard,
  ArrowLeft,
  FileText,
  RotateCcw,
  Pencil
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDocFromServer,
  collection,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Firebase Initialization
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Form Schema
const schema = z.object({
  // Step 1: Personal
  firstNames: z.string().min(1, "Required"),
  surname: z.string().min(1, "Required"),
  maidenName: z.string().optional(),
  maritalStatus: z.string().min(1, "Required"),
  idNumber: z.string().min(13, "Min 13 digits"),
  race: z.string().min(1, "Required"),
  ethnicGroup: z.string().min(1, "Required"),
  memberType: z.enum(['Member', 'Staff', 'User']),
  dateOfBirth: z.string().min(1, "Required"),
  gender: z.string().min(1, "Required"),
  mobilePhone: z.string().min(10, "Required"),
  homePhone: z.string().optional(),
  email: z.string().email("Invalid email"),
  homeLanguage: z.string().min(1, "Required"),
  preferredLanguage: z.string().min(1, "Required"),
  homeAddress: z.string().min(1, "Required"),
  homeAddressCode: z.string().min(4, "Required"),
  postalAddress: z.string().optional(),
  postalAddressCode: z.string().optional(),

  // Step 2: Additional & Employment
  dateJoined: z.string().optional(),
  nationality: z.string().min(1, "Required"),
  idPassport: z.string().min(1, "Required"),
  province: z.string().min(1, "Required"),
  municipality: z.string().min(1, "Required"),
  ward: z.string().optional(),
  chiefInduna: z.string().optional(),
  
  employmentStatus: z.enum(['Employed', 'Self-Employed', 'Pensioner', 'Other']),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  incomePerMonth: z.string().optional(),

  // Step 3: Banking
  bankName: z.string().min(1, "Required"),
  accountHolder: z.string().min(1, "Required"),
  accountNumber: z.string().min(1, "Required"),
  branchName: z.string().optional(),
  branchCode: z.string().optional(),

  // Step 4: Beneficiaries
  beneficiaries: z.array(z.object({
    name: z.string().min(1, "Required"),
    idNumber: z.string().min(1, "Required"),
    phone: z.string().min(1, "Required"),
    relationship: z.string().min(1, "Required"),
    percentage: z.string().min(1, "Required")
  })).max(4),

  // Step 5: Next of Kin
  nokName: z.string().min(1, "Required"),
  nokId: z.string().min(1, "Required"),
  nokRelationship: z.string().min(1, "Required"),
  nokCell1: z.string().min(10, "Required"),
  nokCell2: z.string().optional(),
  
  signature: z.string().min(1, "Please provide your signature"),
});

type FormData = z.infer<typeof schema>;

const STEPS = [
  { id: 'personal', title: 'Personal', icon: User },
  { id: 'employment', title: 'Status', icon: Briefcase },
  { id: 'banking', title: 'Banking', icon: CreditCard },
  { id: 'beneficiaries', title: 'Beneficiaries', icon: Users },
  { id: 'nok', title: 'Next of Kin', icon: Baby },
];

const ADMIN_EMAIL = 'sebolelohlabi23@gmail.com';

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [view, setView] = useState<'form' | 'admin'>('form');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const sigCanvas = React.useRef<SignatureCanvas>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    
    // Test Connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  const fetchSubmissions = async () => {
    setIsLoadingSubmissions(true);
    try {
      const q = query(collection(db, 'applications'), orderBy('submittedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmissions(data);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      setErrorMsg("Unauthorized: Only admins can view all submissions.");
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (view === 'admin' && user?.email === ADMIN_EMAIL) {
      fetchSubmissions();
    }
  }, [view, user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = () => {
    signOut(auth);
    setView('form');
    setIsSubmitted(false);
  };

  const { register, control, handleSubmit, formState: { errors }, trigger, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      memberType: 'Member',
      employmentStatus: 'Employed',
      beneficiaries: [{ name: '', idNumber: '', phone: '', relationship: '', percentage: '' }],
      signature: ''
    }
  });

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setValue('signature', '');
  };

  const saveSignature = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setValue('signature', sigCanvas.current.getTrimmedCanvas().toDataURL('image/png'));
    }
  };

  const { fields, append, remove } = useFieldArray({
    control,
    name: "beneficiaries"
  });

  const nextStep = async () => {
    const fieldsByStep = [
      ['firstNames', 'surname', 'idNumber', 'race', 'ethnicGroup', 'dateOfBirth', 'gender', 'mobilePhone', 'email', 'homeLanguage', 'preferredLanguage', 'homeAddress', 'homeAddressCode'],
      ['dateJoined', 'nationality', 'idPassport', 'province', 'municipality', 'employmentStatus'],
      ['bankName', 'accountHolder', 'accountNumber'],
      ['beneficiaries'],
      ['nokName', 'nokId', 'nokRelationship', 'nokCell1']
    ];

    const result = await trigger(fieldsByStep[currentStep] as any);
    if (result) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const onSubmit = async (data: FormData) => {
    if (!user) {
      setErrorMsg("Please sign in to submit your application.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    
    const applicationId = `APP-${Date.now()}-${user.uid.slice(0, 5)}`;
    
    try {
      await setDoc(doc(db, 'applications', applicationId), {
        ...data,
        ownerId: user.uid,
        ownerEmail: user.email,
        submittedAt: serverTimestamp(),
      });
      setIsSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `applications/${applicationId}`);
      setErrorMsg("Failed to submit. Please check your connection or permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="bg-brand-blue p-8 text-center text-white">
            <img 
              src="https://ais-pre-qkxa63hja4jdmqbyeeowg2-364949645991.europe-west1.run.app/artifact/membership_form" 
              alt="Logo" 
              className="h-20 mx-auto mb-4 object-contain brightness-0 invert"
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
            <h2 className="text-2xl font-display font-bold">Member Portal</h2>
            <p className="text-blue-100 text-sm mt-2 font-light">Ndlovukazi YakwaZulu Women Financial Services Cooperative</p>
          </div>
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="text-brand-blue" size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Secure Registration</h3>
            <p className="text-slate-500 mb-8 text-sm">
              Please sign in with your Google account to start your membership application. 
              Your information is protected and stored securely.
            </p>
            <button 
              onClick={login}
              className="btn-primary w-full flex items-center justify-center gap-3 py-4 shadow-lg active:scale-95 transition-transform"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />
              Sign in with Google
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (view === 'admin' && user?.email === ADMIN_EMAIL) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('form')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                <ArrowLeft size={20} />
              </button>
              <h1 className="text-xl font-display font-bold text-brand-blue">Admin Dashboard</h1>
            </div>
            <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 rounded-lg">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-brand-blue">Membership Applications</h2>
                <p className="text-sm text-slate-500">Total: {submissions.length} submissions received</p>
              </div>
              <button 
                onClick={fetchSubmissions}
                className="btn-secondary text-sm py-1.5 px-4 flex items-center gap-2"
                disabled={isLoadingSubmissions}
              >
                {isLoadingSubmissions ? <Loader2 className="animate-spin" size={14} /> : null}
                Refresh Data
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                    <th className="px-6 py-4">Submission Date</th>
                    <th className="px-6 py-4">Applicant</th>
                    <th className="px-6 py-4">ID Number</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors text-sm">
                      <td className="px-6 py-4 text-slate-500">
                        {sub.submittedAt?.toDate?.() ? new Intl.DateTimeFormat('en-ZA').format(sub.submittedAt.toDate()) : 'Pending'}
                      </td>
                      <td className="px-6 py-4 font-bold text-brand-blue">
                        {sub.firstNames} {sub.surname}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{sub.idNumber}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span>{sub.mobilePhone}</span>
                          <span className="text-[10px] text-slate-400">{sub.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Submitted
                        </span>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && !isLoadingSubmissions && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                        No applications found in the database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-display font-bold text-brand-blue mb-4">Application Received!</h2>
          <p className="text-slate-600 mb-8 text-sm">
            Thank you, {user.displayName || 'Applicant'}! Your application has been saved successfully in our encrypted records. 
            Our regional office will review your details shortly.
          </p>
          <div className="space-y-3">
            <button 
              onClick={() => setIsSubmitted(false)}
              className="btn-primary w-full"
            >
              Submit Another Application
            </button>
            {user.email === ADMIN_EMAIL && (
              <button 
                onClick={() => setView('admin')}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <LayoutDashboard size={18} />
                Open Admin Dashboard
              </button>
            )}
            <button 
              onClick={logout}
              className="w-full text-sm text-slate-400 hover:text-red-500 font-medium transition-colors pt-4"
            >
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://ais-pre-qkxa63hja4jdmqbyeeowg2-364949645991.europe-west1.run.app/artifact/membership_form" 
              alt="Ndlovukazi Logo" 
              className="h-12 w-auto object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = "https://placehold.co/200x80/1e3a8a/b2944b?text=Ndlovukazi";
              }}
            />
            <div className="hidden sm:block">
              <h1 className="text-xl font-display font-bold text-brand-blue leading-tight">Ndlovukazi YakwaZulu</h1>
              <p className="text-xs text-brand-gold font-medium uppercase tracking-widest">Women Financial Services Cooperative</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user.email === ADMIN_EMAIL && (
              <button 
                onClick={() => setView('admin')}
                className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-md hover:bg-black transition-all"
              >
                <LayoutDashboard size={14} />
                Admin Dashboard
              </button>
            )}
            <div className="hidden md:block text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Applicant</p>
              <div className="text-sm font-bold text-brand-blue">{user.email}</div>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100">
          <motion.div 
            className="h-full bg-brand-gold"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Main Form Area */}
      <main className="max-w-6xl mx-auto px-4 mt-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Sidebar Nav */}
          <nav className="w-full lg:w-64 space-y-2">
            <div className="p-4 bg-white rounded-xl border border-slate-200 mb-6 hidden lg:block">
              <div className="flex items-center gap-3 mb-2">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-brand-gold" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-brand-blue flex items-center justify-center text-white font-bold">
                    {user.email?.[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-brand-blue truncate w-32 font-display">{user.displayName || 'Guest User'}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Identity Verified</p>
                </div>
              </div>
            </div>
            {STEPS.map((step, idx) => (
              <div 
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  idx === currentStep 
                    ? 'bg-brand-blue text-white shadow-lg shadow-blue-900/20' 
                    : idx < currentStep 
                    ? 'text-green-600 bg-green-50' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  idx === currentStep ? 'bg-white text-brand-blue' : 'bg-slate-100'
                }`}>
                  <step.icon size={16} />
                </div>
                <span className="font-medium text-sm">{step.title}</span>
                {idx < currentStep && <CheckCircle size={14} className="ml-auto" />}
              </div>
            ))}
          </nav>

          {/* Form Content */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 md:p-8">
              {errorMsg && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-600 rounded-full" />
                  {errorMsg}
                </div>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Step Header */}
                  <div className="mb-8 border-b border-slate-100 pb-4">
                    <h2 className="text-2xl font-display font-bold text-brand-blue">{STEPS[currentStep].title} Information</h2>
                    <p className="text-slate-500 text-sm">Please provide accurate details as they appear on your official documents.</p>
                  </div>

                  {currentStep === 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      <div className="space-y-4">
                        <div>
                          <label className="form-label">First Names</label>
                          <input {...register("firstNames")} className="form-input" placeholder="Enter all names" />
                          {errors.firstNames && <p className="text-red-500 text-xs mt-1 font-medium">{errors.firstNames.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Surname</label>
                          <input {...register("surname")} className="form-input" />
                          {errors.surname && <p className="text-red-500 text-xs mt-1 font-medium">{errors.surname.message}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Gender</label>
                            <select {...register("gender")} className="form-input">
                              <option value="">Select</option>
                              <option value="Female">Female</option>
                              <option value="Male">Male</option>
                              <option value="Other">Other</option>
                            </select>
                            {errors.gender && <p className="text-red-500 text-xs mt-1 font-medium">{errors.gender.message}</p>}
                          </div>
                          <div>
                            <label className="form-label">Date of Birth</label>
                            <input type="date" {...register("dateOfBirth")} className="form-input" />
                            {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1 font-medium">{errors.dateOfBirth.message}</p>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Race</label>
                            <input {...register("race")} className="form-input" placeholder="e.g. Black" />
                            {errors.race && <p className="text-red-500 text-xs mt-1 font-medium">{errors.race.message}</p>}
                          </div>
                          <div>
                            <label className="form-label">Ethnic Group</label>
                            <input {...register("ethnicGroup")} className="form-input" placeholder="e.g. Zulu" />
                            {errors.ethnicGroup && <p className="text-red-500 text-xs mt-1 font-medium">{errors.ethnicGroup.message}</p>}
                          </div>
                        </div>
                        <div>
                          <label className="form-label">Marital Status</label>
                          <select {...register("maritalStatus")} className="form-input">
                            <option value="">Select</option>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Widowed">Widowed</option>
                            <option value="Divorced">Divorced</option>
                          </select>
                          {errors.maritalStatus && <p className="text-red-500 text-xs mt-1 font-medium">{errors.maritalStatus.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">ID / Passport Number</label>
                          <input {...register("idNumber")} className="form-input" placeholder="13-digit ID" />
                          {errors.idNumber && <p className="text-red-500 text-xs mt-1 font-medium">{errors.idNumber.message}</p>}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Home Language</label>
                            <input {...register("homeLanguage")} className="form-input" placeholder="e.g. isiZulu" />
                            {errors.homeLanguage && <p className="text-red-500 text-xs mt-1 font-medium">{errors.homeLanguage.message}</p>}
                          </div>
                          <div>
                            <label className="form-label">Preferred Lang.</label>
                            <select {...register("preferredLanguage")} className="form-input">
                              <option value="English">English</option>
                              <option value="Afrikaans">Afrikaans</option>
                              <option value="isiZulu">isiZulu</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="form-label">Email Address</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input {...register("email")} className="form-input pl-10" placeholder="name@example.com" />
                          </div>
                          {errors.email && <p className="text-red-500 text-xs mt-1 font-medium">{errors.email.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Mobile Phone</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input {...register("mobilePhone")} className="form-input pl-10" placeholder="+27" />
                          </div>
                          {errors.mobilePhone && <p className="text-red-500 text-xs mt-1 font-medium">{errors.mobilePhone.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Home Address</label>
                          <textarea {...register("homeAddress")} className="form-input h-24" placeholder="Street, Suburb, Town" />
                          {errors.homeAddress && <p className="text-red-500 text-xs mt-1 font-medium">{errors.homeAddress.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Postal Code</label>
                          <input {...register("homeAddressCode")} className="form-input" placeholder="4 digits" />
                          {errors.homeAddressCode && <p className="text-red-500 text-xs mt-1 font-medium">{errors.homeAddressCode.message}</p>}
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 1 && (
                    <div className="space-y-8">
                      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="form-label">Date Joined</label>
                          <input type="date" {...register("dateJoined")} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">Nationality</label>
                          <input {...register("nationality")} className="form-input" defaultValue="South African" />
                          {errors.nationality && <p className="text-red-500 text-xs mt-1 font-medium">{errors.nationality.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">ID / Passport Number (Additional)</label>
                          <input {...register("idPassport")} className="form-input" placeholder="Same as or different to main ID" />
                          {errors.idPassport && <p className="text-red-500 text-xs mt-1 font-medium">{errors.idPassport.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Province</label>
                          <select {...register("province")} className="form-input">
                            <option value="">Select Province</option>
                            <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                            <option value="Gauteng">Gauteng</option>
                            <option value="Western Cape">Western Cape</option>
                            <option value="Eastern Cape">Eastern Cape</option>
                            <option value="Free State">Free State</option>
                            <option value="Limpopo">Limpopo</option>
                            <option value="Mpumalanga">Mpumalanga</option>
                            <option value="North West">North West</option>
                            <option value="Northern Cape">Northern Cape</option>
                          </select>
                          {errors.province && <p className="text-red-500 text-xs mt-1 font-medium">{errors.province.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Municipality</label>
                          <input {...register("municipality")} className="form-input" />
                          {errors.municipality && <p className="text-red-500 text-xs mt-1 font-medium">{errors.municipality.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Ward Number</label>
                          <input {...register("ward")} className="form-input" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="form-label">Chief / Induna</label>
                          <input {...register("chiefInduna")} className="form-input" placeholder="Name of Chief / Induna" />
                        </div>
                      </section>

                      <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                        <h3 className="text-lg font-bold text-brand-blue mb-4">Employment Status</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          {['Employed', 'Self-Employed', 'Pensioner', 'Other'].map(type => (
                            <label key={type} className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="radio" 
                                value={type} 
                                {...register("employmentStatus")} 
                                className="w-4 h-4 text-brand-blue"
                              />
                              <span className="text-sm text-slate-700">{type}</span>
                            </label>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Occupation</label>
                            <input {...register("occupation")} className="form-input" />
                          </div>
                          <div>
                            <label className="form-label">Employer Name</label>
                            <input {...register("employer")} className="form-input" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div className="max-w-lg mx-auto space-y-6">
                      <div className="bg-blue-50 p-4 rounded-lg flex gap-3 text-brand-blue text-sm mb-6">
                        <CreditCard className="shrink-0" size={18} />
                        <p>Provide the banking details where you would like to receive distributions or savings payouts.</p>
                      </div>
                      <div>
                        <label className="form-label">Bank Name</label>
                        <select {...register("bankName")} className="form-input">
                          <option value="">Select Bank</option>
                          <option value="FNB">First National Bank (FNB)</option>
                          <option value="Standard Bank">Standard Bank</option>
                          <option value="Nedbank">Nedbank</option>
                          <option value="Absa">Absa</option>
                          <option value="Capitec">Capitec</option>
                          <option value="TymeBank">TymeBank</option>
                          <option value="Other">Other</option>
                        </select>
                        {errors.bankName && <p className="text-red-500 text-xs mt-1 font-medium">{errors.bankName.message}</p>}
                      </div>
                      <div>
                        <label className="form-label">Account Holder Name</label>
                        <input {...register("accountHolder")} className="form-input" placeholder="Full name as it appears at the bank" />
                        {errors.accountHolder && <p className="text-red-500 text-xs mt-1 font-medium">{errors.accountHolder.message}</p>}
                      </div>
                      <div>
                        <label className="form-label">Account Number</label>
                        <input {...register("accountNumber")} className="form-input" />
                        {errors.accountNumber && <p className="text-red-500 text-xs mt-1 font-medium">{errors.accountNumber.message}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">Branch Name</label>
                          <input {...register("branchName")} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">Branch Code</label>
                          <input {...register("branchCode")} className="form-input" />
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="space-y-6">
                      <p className="text-slate-600 text-sm mb-4 italic">
                        Please list the beneficiaries you would like to nominate to receive the proceeds of your investments.
                      </p>
                      
                      {fields.map((field, index) => (
                        <div key={field.id} className="p-4 border border-slate-200 rounded-xl relative hover:border-brand-gold/50 transition-colors">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-brand-blue">Nominee {index + 1}</h4>
                            {fields.length > 1 && (
                              <button type="button" onClick={() => remove(index)} className="text-red-500 hover:text-red-700">
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="form-label">Full Name</label>
                              <input {...register(`beneficiaries.${index}.name` as const)} className="form-input" />
                              {errors.beneficiaries?.[index]?.name && <p className="text-red-500 text-xs mt-1 font-medium">{errors.beneficiaries[index]?.name?.message}</p>}
                            </div>
                            <div>
                              <label className="form-label">ID Number</label>
                              <input {...register(`beneficiaries.${index}.idNumber` as const)} className="form-input" />
                            </div>
                            <div>
                              <label className="form-label">Phone Number</label>
                              <input {...register(`beneficiaries.${index}.phone` as const)} className="form-input" />
                              {errors.beneficiaries?.[index]?.phone && <p className="text-red-500 text-xs mt-1 font-medium">{errors.beneficiaries[index]?.phone?.message}</p>}
                            </div>
                            <div>
                              <label className="form-label">Relationship (e.g. Daughter)</label>
                              <input {...register(`beneficiaries.${index}.relationship` as const)} className="form-input" />
                              {errors.beneficiaries?.[index]?.relationship && <p className="text-red-500 text-xs mt-1 font-medium">{errors.beneficiaries[index]?.relationship?.message}</p>}
                            </div>
                            <div>
                              <label className="form-label">Percentage (%)</label>
                              <input {...register(`beneficiaries.${index}.percentage` as const)} className="form-input" placeholder="e.g. 50" />
                              {errors.beneficiaries?.[index]?.percentage && <p className="text-red-500 text-xs mt-1 font-medium">{errors.beneficiaries[index]?.percentage?.message}</p>}
                            </div>
                          </div>
                        </div>
                      ))}

                      {fields.length < 4 && (
                        <button 
                          type="button" 
                          onClick={() => append({ name: '', idNumber: '', phone: '', relationship: '', percentage: '' })}
                          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-brand-gold/50 transition-all cursor-pointer"
                        >
                          <Plus size={18} />
                          Add Another Beneficiary
                        </button>
                      )}
                    </div>
                  )}

                  {currentStep === 4 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="form-label">Full Names of Kin</label>
                          <input {...register("nokName")} className="form-input" />
                          {errors.nokName && <p className="text-red-500 text-xs mt-1 font-medium">{errors.nokName.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Kin ID Number</label>
                          <input {...register("nokId")} className="form-input" />
                          {errors.nokId && <p className="text-red-500 text-xs mt-1 font-medium">{errors.nokId.message}</p>}
                        </div>
                        <div>
                          <label className="form-label">Relationship</label>
                          <input {...register("nokRelationship")} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">Next of Kin Cell Number</label>
                          <input {...register("nokCell1")} className="form-input" />
                          {errors.nokCell1 && <p className="text-red-500 text-xs mt-1 font-medium">{errors.nokCell1.message}</p>}
                        </div>
                      </div>

                      <div className="mt-8 p-6 bg-slate-100 rounded-2xl border border-slate-200">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Digital Services</h4>
                        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
                          <span className="text-brand-blue font-bold">USSD Access Code</span>
                          <span className="text-xl font-mono font-bold text-brand-gold bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                            *120*0135#
                          </span>
                        </div>
                      </div>

                      <div className="mt-12 p-6 bg-slate-900 text-white rounded-2xl">
                        <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                          <CheckCircle className="text-brand-gold" size={20} />
                          Final Declarations
                        </h4>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>• I hereby apply to be a member and agree to abide by all rules and the constitution.</p>
                          <p>• I agree to pay an annual membership renewal fee of R500.</p>
                          <p>• I agree to a minimum compulsory saving fee of R100 every month.</p>
                          <p>• I consent to the responsible processing of my personal information.</p>
                        </div>
                        
                        <div className="mt-8 border-t border-slate-800 pt-6">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-bold text-slate-400 flex items-center gap-2">
                              <Pencil size={14} />
                              Digital Signature
                            </label>
                            <button 
                              type="button" 
                              onClick={clearSignature}
                              className="text-[10px] uppercase tracking-widest font-bold text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw size={10} />
                              Clear
                            </button>
                          </div>
                          <div className="bg-white rounded-xl overflow-hidden h-40 border-2 border-slate-800 focus-within:border-brand-gold transition-all">
                            <SignatureCanvas 
                              ref={sigCanvas}
                              penColor="#1e3a8a"
                              canvasProps={{
                                className: "signature-canvas w-full h-full cursor-crosshair",
                              }}
                              onEnd={saveSignature}
                            />
                          </div>
                          <input type="hidden" {...register("signature")} />
                          {errors.signature && <p className="text-red-400 text-xs mt-2 font-medium">{errors.signature.message}</p>}
                        </div>

                        <div className="mt-8 flex items-center gap-3">
                          <input type="checkbox" id="terms" className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-brand-gold" required />
                          <label htmlFor="terms" className="text-sm font-medium cursor-pointer">I understand and agree to the terms as stated above.</label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="mt-12 flex items-center justify-between gap-4 pt-6 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={prevStep}
                      disabled={currentStep === 0}
                      className={`btn-secondary flex items-center gap-2 ${currentStep === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      <ChevronLeft size={18} />
                      Back
                    </button>

                    {currentStep === STEPS.length - 1 ? (
                      <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="btn-primary bg-brand-gold hover:bg-brand-gold/80 flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                      >
                        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : null}
                        {isSubmitting ? 'Submitting...' : 'Submit Application'}
                        {!isSubmitting && <CheckCircle size={18} />}
                      </button>
                    ) : (
                      <button 
                        type="button" 
                        onClick={nextStep}
                        className="btn-primary flex items-center gap-2"
                      >
                        Continue
                        <ChevronRight size={18} />
                      </button>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </form>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto px-4 mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 text-slate-500 text-xs border-t border-slate-100 pt-8">
        <div className="flex items-start gap-3">
          <MapPin size={16} className="text-brand-gold shrink-0" />
          <p>16 Harish Road, Nagina, PINETOWN, 4001</p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Phone size={16} className="text-brand-gold shrink-0" />
            <p>Cell: 084 425 1735</p>
          </div>
          <div className="flex items-center gap-3">
            <Mail size={16} className="text-brand-gold shrink-0" />
            <p>info@ndlovukaziyakwazulufcs.co.za</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
