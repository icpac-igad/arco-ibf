import React from 'react';

export default function Page() {
  return (
    <div className='grid-container'>
      <div className='grid-row'>
        <div className='grid-col-12'>
          <h1>About This Dashboard</h1>
          
          <h2>An Open Science Platform for Earth Observation</h2>
          <p>
            This dashboard is powered by open source software originally developed as part of NASA's{' '}
            <strong>Visualization, Exploration, and Data Analysis (VEDA)</strong> project in collaboration with{' '}
            <strong>NASA IMPACT</strong> (Interagency Implementation and Advanced Concepts Team). The VEDA platform 
            represents a significant advancement in making Earth science data more accessible, interactive, and engaging 
            for researchers and the broader public.
          </p>

          <h2>The Story Behind VEDA</h2>
          <p>
            The foundation for this platform was laid during the COVID-19 pandemic in spring 2020, when researchers 
            noticed dramatic changes in the global environment as much of the world's population stayed home. NASA's 
            COVID-19 Dashboard emerged from this need to visualize large-scale environmental changes, which later evolved 
            into the comprehensive VEDA platform we use today.
          </p>
          <p>
            Scientists at NASA were clamoring for more exploration and analysis capabilities, leading Development Seed 
            and NASA IMPACT to create the VEDA project in winter 2022. The challenge was clear: NASA had vast data 
            resources, but the data wasn't always readily accessible or in user-friendly formats that could serve 
            diverse user needs, from data access to analysis and sharing.
          </p>

          <h2>What Makes This Platform Special</h2>
          
          <h3>Open Source Foundation</h3>
          <p>
            In keeping with NASA's open science policies, all VEDA project code repositories and associated documentation 
            are publicly available and accessible via GitHub. This commitment to openness ensures that the tools and 
            methodologies developed can benefit the entire Earth science community.
          </p>

          <h3>Advanced Visualization Capabilities</h3>
          <p>
            The dashboard visualizes data directly off a single authoritative reference that contains data optimized 
            for visualization as well as direct access, avoiding the issue of missing links between source and rendered 
            data. This means that what you see in the visualizations is directly connected to the original scientific 
            data, maintaining the integrity needed for reproducible science.
          </p>

          <h3>Cloud-Native Architecture</h3>
          <p>
            The platform leverages <strong>Analysis-Ready, Cloud-Optimized (ARCO)</strong> data formats and open 
            standards like the <strong>Spatio-Temporal Asset Catalog (STAC)</strong>. Using ARCO data formats and 
            open source tools is vital because, once ingested, this data must be accessed by a variety of tools for 
            many different purposes.
          </p>

          <h2>Interactive Storytelling for Science Communication</h2>
          <p>
            The VEDA Dashboard presents complicated scientific information to the general public in an engaging and 
            understandable way. By incorporating interactive maps and expert narratives, complex information is 
            transformed into engaging stories that attract a wide range of readers, from scientists to enthusiasts 
            with limited scientific knowledge.
          </p>
          <p>
            This approach recognizes that modern data-driven science is not only presented through papers, posters, 
            and lectures to fellow scientists and through reports to decision makers, but also through up-to-date 
            interactive online tools and blogs that are available directly to either audience.
          </p>

          <h2>Built for Collaboration and Reuse</h2>
          <p>
            VEDA seeks to fill the gap in the Earth Observation community for a flexible, open-source, yet powerful 
            platform for scientists to access data, analyze that data to create new data products, and share their 
            work with stakeholders. The platform follows core guiding principles to reuse, combine, and improve 
            existing open-source development efforts.
          </p>
          <p>
            VEDA consolidates Geographic Information Systems (GIS) delivery mechanisms, processing platforms, analysis 
            services, and visualization tools, providing an ecosystem of open tools for addressing Earth science 
            research and application needs.
          </p>

          <h2>Beyond NASA: A Growing Ecosystem</h2>
          <p>
            While originally developed for NASA's Earth science missions, more science teams are taking notice of 
            VEDA's capabilities and want to replicate it for their purposes. This workshop dashboard demonstrates 
            how the open source components can be adapted and customized for different scientific communities and 
            use cases.
          </p>

          <h2>Our Workshop Context</h2>
          <p>
            This ESIP workshop dashboard showcases how the open source software powering VEDA can be used to create 
            engaging, interactive stories about Earth science research. You'll learn to harness these same tools and 
            techniques to transform your own research data into compelling narratives that reach beyond traditional 
            academic audiences.
          </p>
          <p>
            The platform you're experiencing represents the cutting edge of open science infrastructure, designed to 
            make complex Earth science data more accessible, explorable, and impactful for decision-makers and the 
            public alike.
          </p>

          <hr className='margin-y-5' />
          
          <p className='text-italic'>
            For more information about the VEDA project, visit{' '}
            <a href="https://www.earthdata.nasa.gov/data/tools/veda" target="_blank" rel="noopener noreferrer">
              NASA Earthdata
            </a>{' '}
            or explore the{' '}
            <a href="https://github.com/NASA-IMPACT/veda-ui" target="_blank" rel="noopener noreferrer">
              public GitHub repositories
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
