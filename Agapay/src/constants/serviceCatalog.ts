export interface ServiceItem {
  id: string;
  name: string;
}

export interface ServiceCategory {
  id: string;
  category: string;
  services: ServiceItem[]
}

export const SERVICE_DATA: ServiceCategory[] = [
  {
    id: 'neuro',
    category: 'Neurological',
    services: [
      { id: 'neuro_1', name: 'Bell\'s Palsy' },
      { id: 'neuro_2', name: 'Cerebral palsy' },
      { id: 'neuro_3', name: 'Cervical or lumbar radiculopathy' },
      { id: 'neuro_4', name: 'Multiple sclerosis' },
      { id: 'neuro_5', name: 'Parkinson\'s disease' },
      { id: 'neuro_6', name: 'Peripheral nerve injuries' },
      { id: 'neuro_7', name: 'Peripheral Nerve Injury (e.g. Carpal Tunnel Syndrome)' },
      { id: 'neuro_8', name: 'Peripheral neuropathy' },
      { id: 'neuro_9', name: 'Post-stroke rehabilitation' },
      { id: 'neuro_10', name: 'Sciatica' },
      { id: 'neuro_11', name: 'Spinal cord injury' },
      { id: 'neuro_12', name: 'Stroke' },
      { id: 'neuro_13', name: 'Traumatic brain injury' },
    ]
  },
  {
    id: 'musculo',
    category: 'Musculoskeletal',
    services: [
      { id: 'musculo_1', name: 'Frozen Shoulder/Adhesive Capsulitis' },
      { id: 'musculo_2', name: 'Fracture' },
      { id: 'musculo_3', name: 'Scoliosis' },
      { id: 'musculo_4', name: 'Myofascial Pain Syndrome' },
      { id: 'musculo_5', name: 'Low Back Pain' },
      { id: 'musculo_6', name: 'Sprain/Strain' },
      { id: 'musculo_7', name: 'Ligament Tears (ACL, PCL, MCL)' },
      { id: 'musculo_8', name: 'Patellofemoral Pain Syndrome' },
      { id: 'musculo_9', name: 'Plantar Fasciitis' },
      { id: 'musculo_10', name: 'Tendonitis' },
      { id: 'musculo_11', name: 'Bursitis' },
      { id: 'musculo_12', name: 'Muscle Strains' },
    ]
  },
  {
    id: 'pedia',
    category: 'Pediatric',
    services: [
      { id: 'pedia_1', name: 'Global Developmental Delay' },
      { id: 'pedia_2', name: 'Cerebral Palsy' },
      { id: 'pedia_3', name: 'Spina Bifida' },
      { id: 'pedia_4', name: 'Down Syndrome' },
      { id: 'pedia_5', name: 'Torticollis' },
      { id: 'pedia_6', name: 'Plagiocephaly' },
    ]
  },
  {
    id: 'geria',
    category: 'Geriatric',
    services: [
      { id: 'geria_1', name: 'Arthritis' },
      { id: 'geria_2', name: 'Osteoarthritis' },
      { id: 'geria_3', name: 'Deconditioning and Generalized Weakness' },
      { id: 'geria_4', name: 'Gait and Balance Problem' },
      { id: 'geria_5', name: 'Parkinson\'s Disease' },
      { id: 'geria_6', name: 'Osteoporosis' },
      { id: 'geria_7', name: 'Hip Fracture' },
      { id: 'geria_8', name: 'Fall Prevention' },
    ]
  },
  {
    id: 'ortho',
    category: 'Orthopedic',
    services: [
      { id: 'ortho_1', name: 'Total Hip Replacement' },
      { id: 'ortho_2', name: 'Total Knee Replacement' },
      { id: 'ortho_3', name: 'Rotator Cuff Injuries' },
      { id: 'ortho_4', name: 'Anterior Cruciate Ligament (ACL) Injuries' },
      { id: 'ortho_5', name: 'Meniscus Injuries' },
      { id: 'ortho_6', name: 'Shoulder Dislocation' },
      { id: 'ortho_7', name: 'Hip Fracture' },
      { id: 'ortho_8', name: 'Ankle Fracture' },
      { id: 'ortho_9', name: 'Vertebral Compression Fracture' },
      { id: 'ortho_10', name: 'Joint Arthroplasty' },
      { id: 'ortho_11', name: 'Spinal Fusion' },
      { id: 'ortho_12', name: 'Lumbar Disc Herniation' },
    ]
  },
  {
    id: 'sports',
    category: 'Sports',
    services: [
      { id: 'sports_1', name: 'ACL Injury' },
      { id: 'sports_2', name: 'Meniscus Tear' },
      { id: 'sports_3', name: 'Rotator Cuff Tear' },
      { id: 'sports_4', name: 'Tennis Elbow (Lateral Epicondylitis)' },
      { id: 'sports_5', name: 'Golfer\'s Elbow (Medial Epicondylitis)' },
      { id: 'sports_6', name: 'Achilles Tendinitis' },
      { id: 'sports_7', name: 'Shin Splints' },
      { id: 'sports_8', name: 'Runner\'s Knee' },
      { id: 'sports_9', name: 'Hamstring Strain' },
      { id: 'sports_10', name: 'Groin Pull' },
      { id: 'sports_11', name: 'Concussion' },
      { id: 'sports_12', name: 'Ankle Sprain' },
      { id: 'sports_13', name: 'Shoulder Impingement Syndrome' },
    ]
  },
  {
    id: 'cardio',
    category: 'Cardiopulmonary',
    services: [
      { id: 'cardio_1', name: 'Chronic Obstructive Pulmonary Disease (COPD)' },
      { id: 'cardio_2', name: 'Asthma' },
      { id: 'cardio_3', name: 'Pneumonia' },
      { id: 'cardio_4', name: 'Congestive Heart Failure' },
      { id: 'cardio_5', name: 'Coronary Artery Disease' },
      { id: 'cardio_6', name: 'Post-Cardiac Surgery Rehabilitation' },
      { id: 'cardio_7', name: 'Pulmonary Fibrosis' },
      { id: 'cardio_8', name: 'Bronchiectasis' },
      { id: 'cardio_9', name: 'Cystic Fibrosis' },
      { id: 'cardio_10', name: 'Post-COVID-19 Respiratory Complications' },
    ]
  },
  {
    id: 'vestibular',
    category: 'Vestibular',
    services: [
      { id: 'vestibular_1', name: 'Benign Paroxysmal Positional Vertigo (BPPV)' },
      { id: 'vestibular_2', name: 'Vestibular Neuritis' },
      { id: 'vestibular_3', name: 'Labyrinthitis' },
      { id: 'vestibular_4', name: 'Meniere\'s Disease' },
      { id: 'vestibular_5', name: 'Vestibular Migraine' },
      { id: 'vestibular_6', name: 'Persistent Postural-Perceptual Dizziness (PPPD)' },
      { id: 'vestibular_7', name: 'Bilateral Vestibular Hypofunction' },
      { id: 'vestibular_8', name: 'Unilateral Vestibular Hypofunction' },
      { id: 'vestibular_9', name: 'Superior Canal Dehiscence Syndrome' },
      { id: 'vestibular_10', name: 'Cervicogenic Dizziness' },
      { id: 'vestibular_11', name: 'Post-Concussion Syndrome with vestibular symptoms' },
      { id: 'vestibular_12', name: 'Age-related Balance Disorders' },
      { id: 'vestibular_13', name: 'Vestibular Schwannoma (Acoustic Neuroma) rehabilitation' },
      { id: 'vestibular_14', name: 'Mal de Debarquement Syndrome' },
      { id: 'vestibular_15', name: 'Motion Sensitivity' },
    ]
  }
]